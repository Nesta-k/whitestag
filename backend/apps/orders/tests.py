import hashlib
import hmac
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from threading import Barrier
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from uuid import uuid4

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.db import IntegrityError, close_old_connections, transaction
from django.test import (
    RequestFactory,
    SimpleTestCase,
    TestCase,
    TransactionTestCase,
    override_settings,
    skipUnlessDBFeature,
)
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.catalogue.models import Category, Product
from apps.customers.models import Cart, CartItem, CustomerAccount
from apps.inventory.models import InventoryRecord, StockMovement
from apps.inventory.services import (
    InsufficientStock,
    receive_stock,
    release_reservation,
)

from .admin import DeliveryPricingConfigurationAdmin
from .models import (
    DeliveryPricingAuditLog,
    DeliveryPricingConfiguration,
    DeliverySurcharge,
    DeliveryZone,
    Order,
    OrderItem,
    Payment,
    PaymentEvent,
    PaymentRefund,
    amount_to_minor_units,
)
from .payment_services import (
    InvalidPaymentTransition,
    PaymentConflict,
    create_payment_attempt,
    create_payment_refund,
    process_paystack_webhook,
    reconcile_verified_transaction,
    transition_payment_status,
)
from .paystack_client import (
    PAYSTACK_API_BASE_URL,
    PAYSTACK_INITIALIZE_URL,
    PaystackInitializationError,
    PaystackRefundError,
    PaystackVerificationError,
    PaystackWebhookSignatureError,
    initialize_transaction,
    initiate_refund,
    verify_transaction,
    verify_webhook_signature,
)
from .services import (
    InvalidOrderTransition,
    cancel_order,
    complete_order,
    create_order_from_cart,
    expire_unpaid_orders,
)
from .delivery_pricing import (
    DistanceProviderTimeout,
    calculate_delivery_pricing,
)


class OrderApiTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Parts", slug="order-parts")
        self.user, self.customer, self.cart = self.create_customer(
            "order-customer@example.com"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.product = self.create_product(
            sku="ORDER-001",
            name="Brake pad",
            slug="order-brake-pad",
            price="12.50",
        )
        self.inventory = receive_stock(
            self.product.pk,
            10,
            idempotency_key=uuid4(),
        ).inventory
        self.cart_item = CartItem.objects.create(
            cart=self.cart,
            product=self.product,
            quantity=2,
        )
        self.checkout_url = reverse("api:orders:checkout")
        self.shipping = {
            "full_name": "A customer",
            "email": "shipping@example.com",
            "phone": "+233200000000",
            "address_line_1": "1 Example Street",
            "address_line_2": "",
            "city": "Accra",
            "region": "Greater Accra",
            "postal_code": "",
            "country": "GH",
        }
        self.delivery_zone = DeliveryZone.objects.create(
            code="accra",
            name="Accra delivery",
            city="Accra",
            region="Greater Accra",
            estimated_distance_km=Decimal("10.000"),
        )
        self.pricing = DeliveryPricingConfiguration.objects.create(
            version="test-zero-rates-v1",
            is_active=True,
            base_fee=Decimal("0.00"),
            rate_per_km=Decimal("0.0000"),
            rate_per_kg=Decimal("0.0000"),
            minimum_fee=Decimal("0.00"),
            currency="GHS",
        )

    def create_customer(self, email):
        user = get_user_model().objects.create_user(
            username=uuid4().hex,
            email=email,
            password="Violet-River-82!",
        )
        customer = CustomerAccount.objects.create(user=user, email=email)
        cart = Cart.objects.create(customer=customer)
        return user, customer, cart

    def create_product(self, *, sku, name, slug, price="12.50", **kwargs):
        return Product.objects.create(
            sku=sku,
            name=name,
            slug=slug,
            category=self.category,
            product_type=kwargs.pop("product_type", Product.ProductType.SPARE_PART),
            sales_method=kwargs.pop(
                "sales_method",
                Product.SalesMethod.DIRECT_PURCHASE,
            ),
            publication_status=kwargs.pop(
                "publication_status",
                Product.PublicationStatus.PUBLISHED,
            ),
            price=price,
            weight_kg=kwargs.pop("weight_kg", Decimal("1.000")),
            currency=kwargs.pop("currency", "GHS"),
            **kwargs,
        )

    def checkout(self, key=None, shipping=None):
        return self.client.post(
            self.checkout_url,
            shipping or self.shipping,
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(key or uuid4()),
        )

    def create_order(self):
        response = self.checkout()
        return Order.objects.get(public_reference=response.data["public_reference"])

    def payment_initialization(self, order, key=None, data=None):
        return self.client.post(
            reverse(
                "api:orders:payment-initialize",
                args=[order.public_reference],
            ),
            data or {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(key or uuid4()),
        )

    def create_payment(self, order):
        payment, created = create_payment_attempt(order.pk, uuid4())
        self.assertTrue(created)
        return payment

    def verify_payment(self, payment, data=None):
        return self.client.post(
            reverse(
                "api:orders:payment-verify",
                args=[payment.reference],
            ),
            data or {},
            format="json",
        )

    def paystack_webhook(self, payload, secret="test-secret"):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        signature = hmac.new(
            secret.encode("utf-8"),
            body,
            hashlib.sha512,
        ).hexdigest()
        return self.client.post(
            reverse("api:orders:paystack-webhook"),
            body,
            content_type="application/json",
            HTTP_X_PAYSTACK_SIGNATURE=signature,
        )

    def provider_transaction(
        self,
        payment,
        *,
        status_value="success",
        reference=None,
        amount=None,
        currency=None,
        transaction_id="paystack-tx-1",
    ):
        return {
            "reference": reference or payment.reference,
            "status": status_value,
            "amount": (
                payment.amount_minor if amount is None else amount
            ),
            "currency": currency or payment.currency,
            "transaction_id": transaction_id,
        }

    def test_checkout_creates_order_snapshots_totals_reserves_and_clears_cart(self):
        response = self.checkout()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get()
        item = OrderItem.objects.get(order=order)
        self.assertEqual(order.status, Order.Status.PENDING)
        self.assertEqual(order.payment_status, Order.PaymentStatus.UNPAID)
        self.assertEqual(order.currency, "GHS")
        self.assertEqual(order.subtotal, Decimal("25.00"))
        self.assertEqual(order.delivery_fee, Decimal("0.00"))
        self.assertEqual(order.discount, Decimal("0.00"))
        self.assertEqual(order.total, Decimal("25.00"))
        self.assertNotEqual(str(order.public_reference), str(order.pk))
        self.assertEqual(item.product_name, "Brake pad")
        self.assertEqual(item.product_sku, "ORDER-001")
        self.assertEqual(item.quantity, 2)
        self.assertEqual(item.unit_price, Decimal("12.50"))
        self.assertEqual(item.line_total, Decimal("25.00"))
        self.assertEqual(order.shipping_email, "shipping@example.com")
        self.assertEqual(response.data["total"], "25.00")
        self.assertEqual(response.data["payment_status"], Order.PaymentStatus.UNPAID)
        self.assertFalse(CartItem.objects.filter(cart=self.cart).exists())
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.available_quantity, 8)
        self.assertEqual(self.inventory.reserved_quantity, 2)
        self.assertEqual(
            StockMovement.objects.filter(
                inventory_record=self.inventory,
                movement_type=StockMovement.MovementType.RESERVATION,
            ).count(),
            1,
        )

    def test_checkout_uses_database_price_not_client_submitted_price(self):
        response = self.client.post(
            self.checkout_url,
            {
                **self.shipping,
                "price": "0.01",
                "total": "0.01",
                "delivery_fee": "0.00",
                "shipment_weight_kg": "0.001",
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["total"], "25.00")
        self.assertEqual(OrderItem.objects.get().unit_price, Decimal("12.50"))
        self.assertEqual(Order.objects.get().shipment_weight_kg, Decimal("2.000"))

    def test_delivery_price_uses_weight_distance_and_surcharge_and_is_snapshotted(self):
        self.product.weight_kg = Decimal("1.500")
        self.product.save(update_fields=["weight_kg", "updated_at"])
        self.pricing.base_fee = Decimal("3.25")
        self.pricing.rate_per_km = Decimal("0.2500")
        self.pricing.rate_per_kg = Decimal("2.5000")
        self.pricing.minimum_fee = Decimal("0.00")
        self.pricing.save()
        DeliverySurcharge.objects.create(
            code="remote-handling",
            name="Remote handling",
            amount=Decimal("0.50"),
            zone=self.delivery_zone,
        )

        response = self.client.post(
            self.checkout_url,
            {**self.shipping, "delivery_fee": "0.00", "total": "0.01"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get()
        self.assertEqual(order.subtotal, Decimal("25.00"))
        self.assertEqual(order.shipment_weight_kg, Decimal("3.000"))
        self.assertEqual(order.estimated_distance_km, Decimal("10.000"))
        self.assertEqual(order.delivery_fee, Decimal("13.75"))
        self.assertEqual(order.total, Decimal("38.75"))
        self.assertEqual(order.delivery_zone, self.delivery_zone)
        self.assertEqual(order.delivery_zone_code, "accra")
        self.assertEqual(order.delivery_zone_name, "Accra delivery")
        self.assertEqual(response.data["delivery_fee"], "13.75")
        self.assertEqual(response.data["total"], "38.75")
        self.assertEqual(order.delivery_pricing_snapshot["formula_version"], "test-zero-rates-v1")
        self.assertEqual(
            order.delivery_pricing_snapshot["pricing_inputs"]["rate_per_kg"],
            "2.5000",
        )
        self.assertEqual(order.items.get().product_weight_kg, Decimal("1.500"))
        self.assertEqual(
            order.delivery_pricing_snapshot["surcharges"][0]["code"],
            "remote-handling",
        )

    def test_invalid_or_inactive_delivery_area_does_not_create_order(self):
        unknown_area = {**self.shipping, "city": "Tamale", "region": "Northern"}
        invalid_response = self.checkout(shipping=unknown_area)
        self.assertEqual(invalid_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("delivery_pricing", invalid_response.data)
        self.assertFalse(Order.objects.exists())

        self.delivery_zone.is_active = False
        self.delivery_zone.save(update_fields=["is_active", "updated_at"])
        inactive_response = self.checkout()
        self.assertEqual(inactive_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("delivery_pricing", inactive_response.data)
        self.assertFalse(Order.objects.exists())
        self.assertTrue(CartItem.objects.filter(pk=self.cart_item.pk).exists())
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved_quantity, 0)

    def test_idempotent_checkout_preserves_delivery_fee_after_zone_change(self):
        self.pricing.base_fee = Decimal("4.25")
        self.pricing.save(update_fields=["base_fee", "updated_at"])
        key = uuid4()

        first = self.checkout(key=key)
        self.pricing.base_fee = Decimal("19.99")
        self.pricing.save(update_fields=["base_fee", "updated_at"])
        self.delivery_zone.is_active = False
        self.delivery_zone.save(update_fields=["is_active", "updated_at"])
        retry = self.checkout(key=key)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(retry.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["total"], "29.25")
        self.assertEqual(retry.data["total"], "29.25")
        self.assertEqual(retry.data["delivery_fee"], "4.25")
        self.assertEqual(Order.objects.count(), 1)

    def test_missing_product_weight_requires_manual_review(self):
        self.product.weight_kg = None
        self.product.save(update_fields=["weight_kg", "updated_at"])

        quote = calculate_delivery_pricing(
            self.shipping,
            [(self.product, self.cart_item.quantity)],
        )
        response = self.checkout()

        self.assertEqual(quote["status"], "manual_review")
        self.assertIsNone(quote["delivery_fee"])
        self.assertIsNone(quote["shipment_weight_kg"])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Order.objects.exists())
        self.assertTrue(CartItem.objects.filter(pk=self.cart_item.pk).exists())

    def test_invalid_zero_product_weight_requires_manual_review(self):
        self.product.weight_kg = Decimal("0.000")

        quote = calculate_delivery_pricing(
            self.shipping,
            [(self.product, self.cart_item.quantity)],
        )

        self.assertEqual(quote["status"], "manual_review")
        self.assertIsNone(quote["shipment_weight_kg"])
        self.assertIsNone(quote["delivery_fee"])

    def test_unconfigured_distance_and_unsupported_country_require_manual_review(self):
        self.delivery_zone.estimated_distance_km = None
        self.delivery_zone.save(update_fields=["estimated_distance_km", "updated_at"])
        no_distance = calculate_delivery_pricing(
            self.shipping,
            [(self.product, self.cart_item.quantity)],
        )
        unsupported = calculate_delivery_pricing(
            {**self.shipping, "country": "US"},
            [(self.product, self.cart_item.quantity)],
        )

        self.assertEqual(no_distance["status"], "manual_review")
        self.assertIsNone(no_distance["delivery_fee"])
        self.assertEqual(unsupported["status"], "manual_review")
        self.assertIsNone(unsupported["delivery_fee"])

    def test_rounding_minimum_maximum_and_review_thresholds(self):
        self.pricing.base_fee = Decimal("0.02")
        self.pricing.rate_per_km = Decimal("0.0005")
        self.pricing.rate_per_kg = Decimal("0.0000")
        self.pricing.minimum_fee = Decimal("0.00")
        self.pricing.rounding_mode = DeliveryPricingConfiguration.RoundingMode.HALF_UP
        self.pricing.save()
        lines = [(self.product, 1)]

        half_up = calculate_delivery_pricing(self.shipping, lines)
        self.pricing.rounding_mode = DeliveryPricingConfiguration.RoundingMode.HALF_EVEN
        self.pricing.save(update_fields=["rounding_mode", "updated_at"])
        half_even = calculate_delivery_pricing(self.shipping, lines)
        self.assertEqual(half_up["delivery_fee"], "0.03")
        self.assertEqual(half_even["delivery_fee"], "0.02")

        self.pricing.base_fee = Decimal("0.00")
        self.pricing.rate_per_km = Decimal("0.0000")
        self.pricing.minimum_fee = Decimal("1.00")
        self.pricing.maximum_fee = None
        self.pricing.save()
        minimum = calculate_delivery_pricing(self.shipping, lines)
        self.assertEqual(minimum["delivery_fee"], "1.00")
        self.assertTrue(minimum["minimum_fee_applied"])

        self.pricing.base_fee = Decimal("3.00")
        self.pricing.minimum_fee = Decimal("0.00")
        self.pricing.maximum_fee = Decimal("2.00")
        self.pricing.save()
        maximum = calculate_delivery_pricing(self.shipping, lines)
        self.assertEqual(maximum["delivery_fee"], "2.00")
        self.assertTrue(maximum["maximum_fee_applied"])

        self.pricing.maximum_fee = None
        self.pricing.review_weight_threshold_kg = Decimal("0.500")
        self.pricing.save()
        needs_review = calculate_delivery_pricing(self.shipping, lines)
        self.assertEqual(needs_review["status"], "manual_review")
        self.assertIsNone(needs_review["delivery_fee"])

    def test_admin_pricing_changes_record_actor_and_before_after_values(self):
        request = RequestFactory().post("/admin/")
        request.user = self.user
        pricing_admin = DeliveryPricingConfigurationAdmin(
            DeliveryPricingConfiguration,
            admin.site,
        )
        self.pricing.base_fee = Decimal("3.25")

        pricing_admin.save_model(request, self.pricing, form=None, change=True)

        audit = DeliveryPricingAuditLog.objects.get()
        self.assertEqual(audit.actor, self.user)
        self.assertEqual(audit.configuration_type, "pricing")
        self.assertEqual(audit.action, DeliveryPricingAuditLog.Action.UPDATED)
        self.assertEqual(audit.before_state["base_fee"], "0.00")
        self.assertEqual(audit.after_state["base_fee"], "3.25")

    def test_route_provider_timeout_and_failure_require_manual_review(self):
        class TimedOutProvider:
            def estimate_distance(self, zone, destination):
                raise DistanceProviderTimeout("timeout")

        class FailedProvider:
            def estimate_distance(self, zone, destination):
                raise ConnectionError("provider unavailable")

        lines = [(self.product, 1)]
        for provider in (TimedOutProvider(), FailedProvider()):
            with self.subTest(provider=provider.__class__.__name__):
                quote = calculate_delivery_pricing(
                    self.shipping,
                    lines,
                    distance_provider=provider,
                )
                self.assertEqual(quote["status"], "manual_review")
                self.assertIsNone(quote["delivery_fee"])

    def test_delivery_quote_endpoint_uses_server_cart_weights_and_is_protected(self):
        self.pricing.base_fee = Decimal("1.00")
        self.pricing.rate_per_km = Decimal("0.5000")
        self.pricing.rate_per_kg = Decimal("2.0000")
        self.pricing.save()
        url = reverse("api:orders:delivery-quote")
        response = self.client.post(
            url,
            {
                "city": "Accra",
                "region": "Greater Accra",
                "country": "GH",
                "shipment_weight_kg": "0.001",
                "delivery_fee": "0.01",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["shipment_weight_kg"], "2.000")
        self.assertEqual(response.data["estimated_distance_km"], "10.000")
        self.assertEqual(response.data["base_fee"], "1.00")
        self.assertEqual(response.data["distance_component"], "5.0000")
        self.assertEqual(response.data["weight_component"], "4.0000")
        self.assertEqual(response.data["delivery_fee"], "10.00")
        self.assertEqual(response.data["order_total"], "35.00")

        self.client.force_authenticate(user=None)
        unauthorized = self.client.post(
            url,
            {"city": "Accra", "region": "Greater Accra"},
            format="json",
        )
        self.assertIn(
            unauthorized.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_delivery_zone_list_exposes_active_zones_only(self):
        DeliveryZone.objects.create(
            code="kumasi",
            name="Kumasi delivery",
            city="Kumasi",
            region="Ashanti",
            estimated_distance_km=Decimal("5.000"),
        )
        DeliveryZone.objects.create(
            code="inactive",
            name="Inactive delivery",
            city="Cape Coast",
            region="Central",
            estimated_distance_km=Decimal("8.000"),
            is_active=False,
        )

        response = self.client.get(reverse("api:orders:delivery-zone-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(
            {zone["code"] for zone in response.data["results"]},
            {"accra", "kumasi"},
        )

    def test_checkout_rejects_zero_price_and_unsupported_currency(self):
        self.product.price = Decimal("0.00")
        self.product.save(update_fields=["price"])
        zero_price = self.checkout()
        self.assertEqual(zero_price.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Order.objects.exists())

        self.product.price = Decimal("12.50")
        self.product.currency = "USD"
        self.product.save(update_fields=["price", "currency"])
        unsupported_currency = self.checkout()
        self.assertEqual(
            unsupported_currency.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertFalse(Order.objects.exists())
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved_quantity, 0)

    def test_checkout_requires_idempotency_key(self):
        response = self.client.post(self.checkout_url, self.shipping, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Order.objects.exists())
        self.assertTrue(CartItem.objects.filter(pk=self.cart_item.pk).exists())

    def test_empty_cart_is_rejected(self):
        self.cart_item.delete()

        response = self.checkout()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Order.objects.exists())

    def test_ineligible_product_is_rejected_without_clearing_cart(self):
        cases = (
            ("product_type", Product.ProductType.CAR),
            ("sales_method", Product.SalesMethod.QUOTATION),
            ("publication_status", Product.PublicationStatus.DRAFT),
            ("price", None),
        )
        for field, value in cases:
            with self.subTest(field=field):
                setattr(self.product, field, value)
                self.product.save(update_fields=[field])
                response = self.checkout()

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertFalse(Order.objects.exists())
                self.assertTrue(
                    CartItem.objects.filter(pk=self.cart_item.pk).exists()
                )
                setattr(
                    self.product,
                    field,
                    {
                        "product_type": Product.ProductType.SPARE_PART,
                        "sales_method": Product.SalesMethod.DIRECT_PURCHASE,
                        "publication_status": Product.PublicationStatus.PUBLISHED,
                        "price": Decimal("12.50"),
                    }[field],
                )
                self.product.save(update_fields=[field])

        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved_quantity, 0)

    def test_unavailable_stock_is_rejected_without_creating_order(self):
        self.inventory.available_quantity = 1
        self.inventory.save(update_fields=["available_quantity"])

        response = self.checkout()

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(Order.objects.exists())
        self.assertTrue(CartItem.objects.filter(pk=self.cart_item.pk).exists())

    def test_failed_later_reservation_rolls_back_order_earlier_reservation_and_cart(self):
        later_product = self.create_product(
            sku="ORDER-002",
            name="Air filter",
            slug="order-air-filter",
        )
        later_inventory = InventoryRecord.objects.create(
            product=later_product,
            available_quantity=0,
        )
        CartItem.objects.create(
            cart=self.cart,
            product=later_product,
            quantity=1,
        )

        response = self.checkout()

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(Order.objects.exists())
        self.assertFalse(OrderItem.objects.exists())
        self.assertEqual(CartItem.objects.filter(cart=self.cart).count(), 2)
        self.inventory.refresh_from_db()
        later_inventory.refresh_from_db()
        self.assertEqual(self.inventory.available_quantity, 10)
        self.assertEqual(self.inventory.reserved_quantity, 0)
        self.assertEqual(later_inventory.available_quantity, 0)
        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.RESERVATION,
            ).count(),
            0,
        )

    def test_retry_replays_order_without_duplicate_reservation(self):
        key = uuid4()
        first = self.checkout(key=key)
        retry = self.checkout(key=key)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(retry.status_code, status.HTTP_200_OK)
        self.assertEqual(
            retry.data["public_reference"],
            first.data["public_reference"],
        )
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(OrderItem.objects.count(), 1)
        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.RESERVATION,
            ).count(),
            1,
        )
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved_quantity, 2)

    def test_idempotency_key_reuse_with_changed_shipping_is_conflict(self):
        key = uuid4()
        self.assertEqual(self.checkout(key=key).status_code, status.HTTP_201_CREATED)
        changed = {**self.shipping, "city": "Kumasi"}

        response = self.checkout(key=key, shipping=changed)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(Order.objects.count(), 1)

    def test_customers_can_only_list_and_retrieve_their_own_orders(self):
        response = self.checkout()
        order_id = response.data["public_reference"]
        other_user, _, _ = self.create_customer("other-order@example.com")
        self.client.force_authenticate(user=other_user)

        self.assertEqual(self.client.get(reverse("api:orders:list")).data["count"], 0)
        detail = self.client.get(reverse("api:orders:detail", args=[order_id]))
        cancel = self.client.post(reverse("api:orders:cancel", args=[order_id]))

        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(cancel.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Order.objects.count(), 1)

    def test_cancellation_releases_stock_once_and_repeated_call_is_safe(self):
        response = self.checkout()
        order_id = response.data["public_reference"]
        cancel_url = reverse("api:orders:cancel", args=[order_id])

        first = self.client.post(cancel_url)
        second = self.client.post(cancel_url)

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["status"], Order.Status.CANCELLED)
        self.assertEqual(second.data["status"], Order.Status.CANCELLED)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.available_quantity, 10)
        self.assertEqual(self.inventory.reserved_quantity, 0)
        self.assertEqual(
            StockMovement.objects.filter(
                inventory_record=self.inventory,
                movement_type=StockMovement.MovementType.RELEASE,
            ).count(),
            1,
        )
        order = Order.objects.get(public_reference=order_id)
        self.assertEqual(order.delivery_fee, Decimal("0.00"))
        self.assertEqual(
            order.delivery_pricing_snapshot["formula_version"],
            "test-zero-rates-v1",
        )

    def test_paid_or_non_pending_order_cannot_be_cancelled(self):
        response = self.checkout()
        order = Order.objects.get(public_reference=response.data["public_reference"])
        order.payment_status = Order.PaymentStatus.PAID
        order.save(update_fields=["payment_status"])

        paid_cancel = self.client.post(
            reverse("api:orders:cancel", args=[order.public_reference])
        )
        self.assertEqual(paid_cancel.status_code, status.HTTP_409_CONFLICT)

        order.payment_status = Order.PaymentStatus.UNPAID
        order.status = Order.Status.PROCESSING
        order.save(update_fields=["payment_status", "status"])
        processing_cancel = self.client.post(
            reverse("api:orders:cancel", args=[order.public_reference])
        )
        self.assertEqual(processing_cancel.status_code, status.HTTP_409_CONFLICT)

        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved_quantity, 2)
        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.RELEASE,
            ).count(),
            0,
        )

    def test_api_does_not_allow_customer_to_edit_order_totals_or_status(self):
        response = self.checkout()
        detail_url = reverse(
            "api:orders:detail",
            args=[response.data["public_reference"]],
        )

        update_response = self.client.patch(
            detail_url,
            {"total": "0.01", "payment_status": "paid"},
            format="json",
        )

        self.assertEqual(
            update_response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        order = Order.objects.get()
        self.assertEqual(order.total, Decimal("25.00"))
        self.assertEqual(order.payment_status, Order.PaymentStatus.UNPAID)

    def test_service_rejects_invalid_transitions_and_hides_other_customers(self):
        order, _ = create_order_from_cart(
            self.customer.pk,
            uuid4(),
            self.shipping,
        )
        order.status = Order.Status.COMPLETED
        order.save(update_fields=["status"])
        with self.assertRaises(InvalidOrderTransition):
            cancel_order(order.public_reference, customer_id=self.customer.pk)

        other = CustomerAccount.objects.create(
            user=get_user_model().objects.create_user(
                username=uuid4().hex,
                password="Violet-River-82!",
            ),
            email="other@example.com",
        )
        self.assertIsNone(cancel_order(order.public_reference, customer_id=other.pk))

    def test_staff_order_management_is_explicitly_protected(self):
        url = reverse("api:orders:staff-list")
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.user)
        customer_response = self.client.post(
            self.checkout_url,
            self.shipping,
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(customer_response.status_code, status.HTTP_201_CREATED)
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)

        staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            password="Violet-River-82!",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff_user)
        staff_response = self.client.get(url)
        self.assertEqual(staff_response.status_code, status.HTTP_200_OK)
        self.assertEqual(staff_response.data["count"], 1)

    def test_staff_dashboard_metrics_and_payment_list_require_staff(self):
        created = self.checkout()
        order = Order.objects.get(public_reference=created.data["public_reference"])
        payment, _ = create_payment_attempt(order.pk, uuid4())
        order.payment_status = Order.PaymentStatus.PAID
        order.status = Order.Status.PROCESSING
        order.save(update_fields=["payment_status", "status"])

        overview_url = reverse("api:orders:staff-dashboard")
        payments_url = reverse("api:orders:staff-payments")
        self.client.force_authenticate(user=self.user)
        self.assertEqual(
            self.client.get(overview_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get(payments_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="dashboard-staff@example.com",
            password="Staff-Password-93!",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff_user)
        overview = self.client.get(overview_url)
        payments = self.client.get(payments_url)

        self.assertEqual(overview.status_code, status.HTTP_200_OK)
        self.assertEqual(overview.data["orders_by_status"]["processing"], 1)
        self.assertEqual(overview.data["orders_by_payment_status"]["paid"], 1)
        self.assertEqual(overview.data["paid_revenue"], "25.00")
        self.assertEqual(payments.status_code, status.HTTP_200_OK)
        payment_item = payments.data["results"][0]
        self.assertEqual(payment_item["reference"], payment.reference)
        self.assertEqual(payment_item["order_reference"], str(order.public_reference))
        self.assertNotIn("authorization_url", payment_item)
        self.assertNotIn("provider_transaction_id", payment_item)

    def test_delivery_pricing_management_is_superuser_only_and_audited(self):
        config_url = reverse(
            "api:orders:superadmin-pricing-configuration-detail",
            args=[self.pricing.pk],
        )
        self.client.force_authenticate(user=self.user)
        self.assertEqual(
            self.client.patch(
                config_url,
                {"base_fee": "7.25"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="pricing-staff@example.com",
            password="Secure-Pricing-Staff-Password-92!",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff_user)
        self.assertEqual(
            self.client.get(
                reverse("api:orders:superadmin-pricing-configuration-list")
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        superuser = get_user_model().objects.create_superuser(
            username=uuid4().hex,
            email="pricing-root@example.com",
            password="Secure-Pricing-Root-Password-92!",
        )
        self.client.force_authenticate(user=superuser)
        updated = self.client.patch(
            config_url,
            {"base_fee": "7.25", "version": "test-zero-rates-v2"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["base_fee"], "7.25")

        invalid = self.client.patch(
            config_url,
            {"minimum_fee": "10.00", "maximum_fee": "9.00"},
            format="json",
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        audit = self.client.get(
            reverse("api:orders:superadmin-delivery-pricing-audit")
        )
        self.assertEqual(audit.status_code, status.HTTP_200_OK)
        self.assertTrue(
            any(entry["actor_username"] == superuser.username for entry in audit.data["results"])
        )

    def test_payment_attempt_snapshots_order_amount_and_is_idempotent(self):
        response = self.checkout()
        order = Order.objects.get(public_reference=response.data["public_reference"])
        key = uuid4()

        payment, created = create_payment_attempt(order.pk, key)
        retry, retried_created = create_payment_attempt(order.pk, key)

        self.assertTrue(created)
        self.assertFalse(retried_created)
        self.assertEqual(payment.pk, retry.pk)
        self.assertEqual(payment.provider, Payment.Provider.PAYSTACK)
        self.assertEqual(payment.status, Payment.Status.INITIALIZING)
        self.assertEqual(payment.amount, order.total)
        self.assertEqual(payment.currency, order.currency)
        self.assertEqual(payment.amount_minor, 2500)
        self.assertRegex(payment.reference, r"^ws_[0-9a-f]{32}$")

    def test_payment_attempt_rejects_a_second_active_attempt(self):
        response = self.checkout()
        order = Order.objects.get(public_reference=response.data["public_reference"])
        create_payment_attempt(order.pk, uuid4())

        with self.assertRaises(PaymentConflict):
            create_payment_attempt(order.pk, uuid4())

    def test_payment_status_transitions_are_service_controlled(self):
        response = self.checkout()
        order = Order.objects.get(public_reference=response.data["public_reference"])
        payment, _ = create_payment_attempt(order.pk, uuid4())

        with self.assertRaises(InvalidPaymentTransition):
            transition_payment_status(payment.pk, Payment.Status.SUCCEEDED)

        pending, changed = transition_payment_status(
            payment.pk,
            Payment.Status.PENDING,
        )
        self.assertTrue(changed)
        with self.assertRaises(InvalidPaymentTransition):
            transition_payment_status(
                pending.pk,
                Payment.Status.SUCCEEDED,
                provider_transaction_id="provider-transaction-001",
            )
        verified = reconcile_verified_transaction(
            pending.pk,
            self.provider_transaction(
                pending,
                transaction_id="provider-transaction-001",
            ),
        )
        succeeded = verified.payment
        self.assertEqual(verified.outcome, "succeeded")
        self.assertIsNotNone(succeeded.processed_at)
        self.assertIsNotNone(succeeded.succeeded_at)
        self.assertEqual(
            Order.objects.get(pk=order.pk).payment_status,
            Order.PaymentStatus.PAID,
        )

        duplicate = reconcile_verified_transaction(
            succeeded.pk,
            self.provider_transaction(
                succeeded,
                transaction_id="provider-transaction-001",
            ),
        )
        self.assertEqual(duplicate.outcome, "succeeded")
        self.assertEqual(duplicate.payment.pk, succeeded.pk)
        with self.assertRaises(InvalidPaymentTransition):
            transition_payment_status(succeeded.pk, Payment.Status.FAILED)
        with self.assertRaises(PaymentConflict):
            create_payment_attempt(order.pk, uuid4())

    def test_order_cancellation_waits_for_an_active_payment_attempt(self):
        response = self.checkout()
        order = Order.objects.get(public_reference=response.data["public_reference"])
        payment, _ = create_payment_attempt(order.pk, uuid4())
        cancel_url = reverse(
            "api:orders:cancel",
            args=[order.public_reference],
        )

        blocked = self.client.post(cancel_url)
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved_quantity, 2)
        self.assertFalse(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.RELEASE,
            ).exists()
        )

        transition_payment_status(payment.pk, Payment.Status.FAILED)
        cancelled = self.client.post(cancel_url)
        self.assertEqual(cancelled.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved_quantity, 0)

    def test_expiry_releases_old_unpaid_order_reservation_once(self):
        order = self.create_order()
        cutoff = timezone.now() - timedelta(hours=25)
        Order.objects.filter(pk=order.pk).update(
            created_at=cutoff - timedelta(seconds=1)
        )

        expired = expire_unpaid_orders(cutoff)
        repeated = expire_unpaid_orders(cutoff)

        self.assertEqual(expired, [order.pk])
        self.assertEqual(repeated, [])
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.EXPIRED)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.available_quantity, 10)
        self.assertEqual(self.inventory.reserved_quantity, 0)
        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.RELEASE,
                reference=str(order.public_reference),
                reason="Unpaid order expired",
            ).count(),
            1,
        )

    def test_expiry_skips_unresolved_payment_attempts(self):
        order = self.create_order()
        create_payment_attempt(order.pk, uuid4())
        cutoff = timezone.now() + timedelta(seconds=1)

        expired = expire_unpaid_orders(cutoff)

        self.assertEqual(expired, [])
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PENDING)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved_quantity, 2)

    def test_order_completion_is_staff_only_paid_and_idempotent(self):
        order = self.create_order()
        order.status = Order.Status.PROCESSING
        order.payment_status = Order.PaymentStatus.PAID
        order.save(update_fields=["status", "payment_status"])
        url = reverse(
            "api:orders:staff-complete",
            args=[order.public_reference],
        )

        denied = self.client.post(url)
        staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            password="test-password",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff_user)
        completed = self.client.post(url)
        repeated = self.client.post(url)

        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(completed.status_code, status.HTTP_200_OK)
        self.assertEqual(completed.data["status"], Order.Status.COMPLETED)
        self.assertEqual(repeated.status_code, status.HTTP_200_OK)
        self.assertEqual(repeated.data["status"], Order.Status.COMPLETED)

    def test_order_completion_rejects_unpaid_order(self):
        order = self.create_order()

        with self.assertRaises(InvalidOrderTransition):
            complete_order(order.public_reference)

    def test_payment_database_constraints_reject_duplicate_reference_and_status(self):
        response = self.checkout()
        order = Order.objects.get(public_reference=response.data["public_reference"])
        payment, _ = create_payment_attempt(order.pk, uuid4())

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Payment.objects.create(
                    order=order,
                    reference=payment.reference,
                    amount=payment.amount,
                    amount_minor=payment.amount_minor,
                    currency=payment.currency,
                    idempotency_key=uuid4(),
                )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Payment.objects.create(
                    order=order,
                    amount=payment.amount,
                    amount_minor=payment.amount_minor,
                    currency=payment.currency,
                    status="not-a-payment-state",
                    idempotency_key=uuid4(),
                )

    def test_payment_event_deduplication_key_is_unique_per_provider(self):
        event = PaymentEvent.objects.create(
            payment=None,
            deduplication_key="sha256:example-digest",
            event_identifier="provider-event-001",
            payload_digest="a" * 64,
            event_type="charge.success",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PaymentEvent.objects.create(
                    deduplication_key=event.deduplication_key,
                    event_identifier="provider-event-002",
                    payload_digest="b" * 64,
                    event_type="charge.success",
                )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PaymentEvent.objects.create(
                    deduplication_key="event:provider-event-001",
                    event_identifier=event.event_identifier,
                    payload_digest="c" * 64,
                    event_type="charge.success",
                )

    def test_ghs_minor_unit_conversion_is_explicit(self):
        self.assertEqual(amount_to_minor_units(Decimal("12.34"), "GHS"), 1234)
        with self.assertRaises(ValueError):
            amount_to_minor_units(Decimal("12.345"), "GHS")
        with self.assertRaises(ValueError):
            amount_to_minor_units(Decimal("12.34"), "USD")

    @patch("apps.orders.views.initialize_paystack_transaction")
    def test_payment_initialization_uses_order_snapshot_and_returns_minimal_data(
        self,
        initialize,
    ):
        order = self.create_order()
        key = uuid4()
        authorization_url = "https://checkout.paystack.com/example"
        initialize.return_value = authorization_url

        response = self.payment_initialization(
            order,
            key=key,
            data={
                "amount": "0.01",
                "currency": "USD",
                "payment_status": "succeeded",
                "customer": "attacker@example.com",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.amount, order.total)
        self.assertEqual(payment.amount_minor, 2500)
        self.assertEqual(payment.currency, "GHS")
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(payment.authorization_url, authorization_url)
        self.assertEqual(
            response.data,
            {
                "reference": payment.reference,
                "status": Payment.Status.PENDING,
                "authorization_url": authorization_url,
            },
        )
        initialize.assert_called_once_with(payment, order.shipping_email)

    @patch("apps.orders.views.initialize_paystack_transaction")
    def test_payment_amount_includes_snapshotted_delivery_fee(self, initialize):
        self.pricing.base_fee = Decimal("7.50")
        self.pricing.save(update_fields=["base_fee", "updated_at"])
        order = self.create_order()
        self.pricing.base_fee = Decimal("19.99")
        self.pricing.save(update_fields=["base_fee", "updated_at"])
        self.delivery_zone.is_active = False
        self.delivery_zone.save(
            update_fields=["is_active", "updated_at"]
        )
        initialize.return_value = "https://checkout.paystack.com/example"

        response = self.payment_initialization(order)

        payment = Payment.objects.get(order=order)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(order.total, Decimal("32.50"))
        self.assertEqual(payment.amount, Decimal("32.50"))
        self.assertEqual(payment.amount_minor, 3250)
        initialize.assert_called_once_with(payment, order.shipping_email)

    @patch("apps.orders.views.initialize_paystack_transaction")
    def test_payment_initialization_retry_reuses_attempt_without_second_call(
        self,
        initialize,
    ):
        order = self.create_order()
        key = uuid4()
        initialize.return_value = "https://checkout.paystack.com/example"

        first = self.payment_initialization(order, key=key)
        retry = self.payment_initialization(order, key=key)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(retry.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data, retry.data)
        self.assertEqual(Payment.objects.filter(order=order).count(), 1)
        initialize.assert_called_once()

    @patch("apps.orders.views.initialize_paystack_transaction")
    def test_unresolved_initialization_retry_does_not_repeat_provider_request(
        self,
        initialize,
    ):
        order = self.create_order()
        key = uuid4()
        initialize.side_effect = PaystackInitializationError("ambiguous response")

        failed_response = self.payment_initialization(order, key=key)
        retry = self.payment_initialization(order, key=key)

        self.assertEqual(
            failed_response.status_code,
            status.HTTP_502_BAD_GATEWAY,
        )
        self.assertEqual(failed_response.data["status"], Payment.Status.INITIALIZING)
        self.assertEqual(retry.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(retry.data["reference"], failed_response.data["reference"])
        self.assertIsNone(retry.data["authorization_url"])
        self.assertEqual(Payment.objects.filter(order=order).count(), 1)
        initialize.assert_called_once()

    @patch("apps.orders.views.initialize_paystack_transaction")
    def test_payment_initialization_provider_error_keeps_attempt_unresolved(
        self,
        initialize,
    ):
        order = self.create_order()
        initialize.side_effect = PaystackInitializationError("provider unavailable")

        response = self.payment_initialization(order)

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.status, Payment.Status.INITIALIZING)
        self.assertEqual(payment.authorization_url, "")

    @patch("apps.orders.views.initialize_paystack_transaction")
    def test_payment_initialization_requires_owned_customer_order(
        self,
        initialize,
    ):
        order = self.create_order()
        other_user, _, _ = self.create_customer("other-payment@example.com")
        self.client.force_authenticate(user=other_user)

        response = self.payment_initialization(order)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Payment.objects.filter(order=order).exists())
        initialize.assert_not_called()

    @patch("apps.orders.views.initialize_paystack_transaction")
    def test_staff_cannot_initialize_payment_for_an_order(self, initialize):
        order = self.create_order()
        staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            password="test-password",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff_user)

        response = self.payment_initialization(order)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Payment.objects.filter(order=order).exists())
        initialize.assert_not_called()

    def test_payment_initialization_requires_uuid_idempotency_key(self):
        order = self.create_order()
        url = reverse(
            "api:orders:payment-initialize",
            args=[order.public_reference],
        )

        missing = self.client.post(url, {}, format="json")
        invalid = self.client.post(
            url,
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY="not-a-uuid",
        )
        too_long = self.client.post(
            url,
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=f"{uuid4()}x",
        )

        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(too_long.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Payment.objects.filter(order=order).exists())

    @patch("apps.orders.views.initialize_paystack_transaction")
    def test_payment_initialization_requires_authentication(self, initialize):
        order = self.create_order()
        self.client.force_authenticate(user=None)

        response = self.payment_initialization(order)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Payment.objects.filter(order=order).exists())
        initialize.assert_not_called()

    @patch("apps.orders.views.verify_paystack_transaction")
    def test_verified_success_settles_order_and_consumes_reserved_stock_once(
        self,
        verify,
    ):
        order = self.create_order()
        payment = self.create_payment(order)
        verify.return_value = self.provider_transaction(payment)

        first = self.verify_payment(
            payment,
            {
                "reference": "client-supplied-reference",
                "amount": 1,
                "currency": "USD",
            },
        )
        second = self.verify_payment(payment)

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["outcome"], "succeeded")
        self.assertEqual(first.data["status"], Payment.Status.SUCCEEDED)
        self.assertEqual(second.data, first.data)
        verify.assert_called_once_with(payment)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(order.status, Order.Status.PROCESSING)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved_quantity, 0)
        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.SALE,
                reference=str(order.public_reference),
            ).count(),
            1,
        )

    @patch("apps.orders.views.verify_paystack_transaction")
    def test_late_success_with_newer_active_attempt_is_reconciled_safely(
        self,
        verify,
    ):
        order = self.create_order()
        earlier_payment = self.create_payment(order)
        transition_payment_status(
            earlier_payment.pk,
            Payment.Status.FAILED,
        )
        newer_payment = self.create_payment(order)
        transition_payment_status(
            newer_payment.pk,
            Payment.Status.PENDING,
        )
        verify.side_effect = [
            self.provider_transaction(
                earlier_payment,
                transaction_id="paystack-tx-earlier",
            ),
            self.provider_transaction(
                newer_payment,
                transaction_id="paystack-tx-newer",
            ),
        ]

        earlier_result = self.verify_payment(earlier_payment)
        newer_result = self.verify_payment(newer_payment)

        self.assertEqual(earlier_result.data["outcome"], "succeeded")
        self.assertEqual(newer_result.data["outcome"], "refund_required")
        earlier_payment.refresh_from_db()
        newer_payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(earlier_payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(newer_payment.status, Payment.Status.REFUND_REQUIRED)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(order.status, Order.Status.PROCESSING)
        self.assertTrue(
            PaymentEvent.objects.filter(
                payment=newer_payment,
                event_type="verification.success_after_order_closed",
            ).exists()
        )
        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.SALE,
                reference=str(order.public_reference),
            ).count(),
            1,
        )

    @patch("apps.orders.views.verify_paystack_transaction")
    def test_late_pending_result_does_not_conflict_with_newer_attempt(
        self,
        verify,
    ):
        order = self.create_order()
        earlier_payment = self.create_payment(order)
        transition_payment_status(
            earlier_payment.pk,
            Payment.Status.FAILED,
        )
        newer_payment = self.create_payment(order)
        transition_payment_status(
            newer_payment.pk,
            Payment.Status.PENDING,
        )
        verify.return_value = self.provider_transaction(
            earlier_payment,
            status_value="ongoing",
            transaction_id="paystack-tx-earlier",
        )

        response = self.verify_payment(earlier_payment)

        self.assertEqual(
            response.data["outcome"],
            "reconciliation_required",
        )
        earlier_payment.refresh_from_db()
        newer_payment.refresh_from_db()
        self.assertEqual(
            earlier_payment.status,
            Payment.Status.RECONCILIATION_REQUIRED,
        )
        self.assertEqual(newer_payment.status, Payment.Status.PENDING)
        self.assertTrue(
            PaymentEvent.objects.filter(
                payment=earlier_payment,
                event_type="verification.overlapping_pending_attempt",
            ).exists()
        )
        self.assertFalse(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.SALE,
                reference=str(order.public_reference),
            ).exists()
        )

    @patch("apps.orders.views.verify_paystack_transaction")
    def test_verification_mismatches_require_reconciliation_without_stock_sale(
        self,
        verify,
    ):
        mismatch_cases = (
            {"amount": 2499},
            {"currency": "USD"},
            {"reference": "another-reference"},
        )
        for mismatch in mismatch_cases:
            with self.subTest(mismatch=mismatch):
                if not CartItem.objects.filter(
                    cart=self.cart,
                    product=self.product,
                ).exists():
                    CartItem.objects.create(
                        cart=self.cart,
                        product=self.product,
                        quantity=2,
                    )
                order = self.create_order()
                payment = self.create_payment(order)
                verify.return_value = self.provider_transaction(
                    payment,
                    transaction_id=f"payment-tx-{uuid4()}",
                    **mismatch,
                )

                response = self.verify_payment(payment)

                self.assertEqual(response.data["outcome"], "reconciliation_required")
                payment.refresh_from_db()
                self.assertEqual(
                    payment.status,
                    Payment.Status.RECONCILIATION_REQUIRED,
                )
                self.assertEqual(
                    PaymentEvent.objects.filter(
                        payment=payment,
                        event_type="verification.mismatch",
                    ).count(),
                    1,
                )
                self.assertEqual(
                    StockMovement.objects.filter(
                        movement_type=StockMovement.MovementType.SALE,
                        reference=str(order.public_reference),
                    ).count(),
                    0,
                )

    @patch("apps.orders.views.verify_paystack_transaction")
    def test_pending_provider_status_does_not_settle_order(self, verify):
        order = self.create_order()
        payment = self.create_payment(order)
        verify.return_value = self.provider_transaction(
            payment,
            status_value="ongoing",
        )

        response = self.verify_payment(payment)

        self.assertEqual(response.data["outcome"], "pending")
        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.PENDING)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PENDING)
        self.assertEqual(order.status, Order.Status.PENDING)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved_quantity, 2)
        self.assertFalse(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.SALE,
            ).exists()
        )

    @patch("apps.orders.views.verify_paystack_transaction")
    def test_unknown_provider_status_is_inconclusive_not_success(self, verify):
        order = self.create_order()
        payment = self.create_payment(order)
        verify.return_value = self.provider_transaction(
            payment,
            status_value="reversed",
        )

        response = self.verify_payment(payment)

        self.assertEqual(response.data["outcome"], "inconclusive")
        self.assertEqual(response.data["status"], Payment.Status.INITIALIZING)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, Order.PaymentStatus.UNPAID)
        self.assertFalse(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.SALE,
            ).exists()
        )

    @patch("apps.orders.views.verify_paystack_transaction")
    def test_verified_failure_releases_attempt_for_cancellation(self, verify):
        order = self.create_order()
        payment = self.create_payment(order)
        verify.return_value = self.provider_transaction(
            payment,
            status_value="failed",
        )

        response = self.verify_payment(payment)

        self.assertEqual(response.data["outcome"], "failed")
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.FAILED)
        cancel = self.client.post(
            reverse("api:orders:cancel", args=[order.public_reference])
        )
        self.assertEqual(cancel.status_code, status.HTTP_200_OK)

    @patch("apps.orders.views.verify_paystack_transaction")
    def test_verification_provider_timeout_does_not_change_payment(self, verify):
        order = self.create_order()
        payment = self.create_payment(order)
        verify.side_effect = PaystackVerificationError("timeout")

        response = self.verify_payment(payment)

        self.assertEqual(
            response.status_code,
            status.HTTP_502_BAD_GATEWAY,
        )
        self.assertEqual(response.data["outcome"], "inconclusive")
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.INITIALIZING)
        verify.assert_called_once_with(payment)

    @patch("apps.orders.views.verify_paystack_transaction")
    def test_verification_rejects_unknown_or_other_customers_payment(
        self,
        verify,
    ):
        order = self.create_order()
        payment = self.create_payment(order)
        other_user, _, _ = self.create_customer("payment-owner@example.com")
        self.client.force_authenticate(user=other_user)

        response = self.verify_payment(payment)
        unknown = self.client.post(
            reverse(
                "api:orders:payment-verify",
                args=["ws_not-a-known-payment-reference"],
            ),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(unknown.status_code, status.HTTP_404_NOT_FOUND)
        verify.assert_not_called()

    @patch("apps.orders.views.verify_paystack_transaction")
    def test_staff_cannot_verify_customer_payment(self, verify):
        order = self.create_order()
        payment = self.create_payment(order)
        staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            password="test-password",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff_user)

        response = self.verify_payment(payment)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        verify.assert_not_called()

    @patch("apps.orders.views.verify_paystack_transaction")
    def test_success_after_order_cancellation_requires_refund_without_sale(
        self,
        verify,
    ):
        order = self.create_order()
        payment = self.create_payment(order)
        transition_payment_status(payment.pk, Payment.Status.FAILED)
        cancel = self.client.post(
            reverse("api:orders:cancel", args=[order.public_reference])
        )
        self.assertEqual(cancel.status_code, status.HTTP_200_OK)
        verify.return_value = self.provider_transaction(payment)

        response = self.verify_payment(payment)

        self.assertEqual(response.data["outcome"], "refund_required")
        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.REFUND_REQUIRED)
        self.assertEqual(order.status, Order.Status.CANCELLED)
        self.assertEqual(order.payment_status, Order.PaymentStatus.UNPAID)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.available_quantity, 10)
        self.assertEqual(self.inventory.reserved_quantity, 0)
        self.assertFalse(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.SALE,
            ).exists()
        )
        self.assertTrue(
            PaymentEvent.objects.filter(
                payment=payment,
                event_type="verification.success_after_order_closed",
            ).exists()
        )

    @patch("apps.orders.views.verify_paystack_transaction")
    def test_partial_stock_sale_rolls_back_and_requires_reconciliation(
        self,
        verify,
    ):
        second_product = self.create_product(
            sku="ORDER-VERIFY-002",
            name="Oil filter",
            slug="order-verify-oil-filter",
        )
        second_inventory = receive_stock(
            second_product.pk,
            5,
            idempotency_key=uuid4(),
        ).inventory
        CartItem.objects.create(
            cart=self.cart,
            product=second_product,
            quantity=1,
        )
        order = self.create_order()
        second_item = OrderItem.objects.get(
            order=order,
            product=second_product,
        )
        release_reservation(
            second_product.pk,
            1,
            idempotency_key=uuid4(),
            reference=str(order.public_reference),
        )
        payment = self.create_payment(order)
        verify.return_value = self.provider_transaction(payment)

        response = self.verify_payment(payment)

        self.assertEqual(response.data["outcome"], "refund_required")
        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.SALE,
                reference=str(order.public_reference),
            ).count(),
            0,
        )
        self.inventory.refresh_from_db()
        second_inventory.refresh_from_db()
        self.assertEqual(self.inventory.reserved_quantity, 2)
        self.assertEqual(second_inventory.reserved_quantity, 0)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.REFUND_REQUIRED)
        self.assertEqual(second_item.quantity, 1)

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    def test_signed_success_webhook_settles_once_and_deduplicates_replay(self):
        order = self.create_order()
        payment = self.create_payment(order)
        payload = {
            "event": "charge.success",
            "data": {
                "id": 64001,
                "status": "success",
                "reference": payment.reference,
                "amount": payment.amount_minor,
                "currency": payment.currency,
            },
        }

        first = self.paystack_webhook(payload)
        replay = self.paystack_webhook(payload)

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["outcome"], "succeeded")
        self.assertEqual(replay.status_code, status.HTTP_200_OK)
        self.assertEqual(replay.data["outcome"], "duplicate")
        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.SUCCEEDED)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(order.status, Order.Status.PROCESSING)
        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.SALE,
                reference=str(order.public_reference),
            ).count(),
            1,
        )
        self.assertEqual(
            PaymentEvent.objects.filter(event_type="webhook.charge.success").count(),
            1,
        )

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    def test_invalid_webhook_signature_cannot_mutate_payment_or_stock(self):
        order = self.create_order()
        payment = self.create_payment(order)
        payload = {
            "event": "charge.success",
            "data": self.provider_transaction(payment),
        }
        response = self.paystack_webhook(payload, secret="different-secret")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.INITIALIZING)
        self.assertEqual(order.payment_status, Order.PaymentStatus.UNPAID)
        self.assertFalse(PaymentEvent.objects.exists())
        self.assertFalse(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.SALE,
            ).exists()
        )

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    def test_contradictory_webhook_status_is_audited_but_not_settled(self):
        order = self.create_order()
        payment = self.create_payment(order)
        payload = {
            "event": "charge.success",
            "data": self.provider_transaction(payment, status_value="failed"),
        }

        response = self.paystack_webhook(payload)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["outcome"], "contradictory_or_invalid")
        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.INITIALIZING)
        self.assertEqual(order.payment_status, Order.PaymentStatus.UNPAID)
        self.assertTrue(
            PaymentEvent.objects.filter(
                event_type="webhook.contradictory_or_invalid",
                processing_status=PaymentEvent.ProcessingStatus.IGNORED,
            ).exists()
        )

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    def test_failed_abandoned_and_pending_webhooks_never_mark_order_paid(self):
        event_cases = (
            ("charge.failed", "failed", Payment.Status.FAILED),
            ("charge.abandoned", "abandoned", Payment.Status.ABANDONED),
            ("charge.pending", "pending", Payment.Status.PENDING),
        )
        for event_type, provider_status, expected_payment_status in event_cases:
            with self.subTest(event=event_type):
                if not CartItem.objects.filter(
                    cart=self.cart,
                    product=self.product,
                ).exists():
                    CartItem.objects.create(
                        cart=self.cart,
                        product=self.product,
                        quantity=2,
                    )
                order = self.create_order()
                payment = self.create_payment(order)
                payload = {
                    "event": event_type,
                    "data": self.provider_transaction(
                        payment,
                        status_value=provider_status,
                        transaction_id=f"paystack-{uuid4()}",
                    ),
                }

                response = self.paystack_webhook(payload)

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                payment.refresh_from_db()
                order.refresh_from_db()
                self.assertEqual(payment.status, expected_payment_status)
                self.assertNotEqual(
                    order.payment_status,
                    Order.PaymentStatus.PAID,
                )
                self.assertFalse(
                    StockMovement.objects.filter(
                        movement_type=StockMovement.MovementType.SALE,
                        reference=str(order.public_reference),
                    ).exists()
                )

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    def test_unknown_reference_webhook_is_durably_ignored(self):
        payload = {
            "event": "charge.success",
            "data": {
                "id": 64002,
                "status": "success",
                "reference": "ws_unknown",
                "amount": 2500,
                "currency": "GHS",
            },
        }

        response = self.paystack_webhook(payload)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["outcome"], "unknown_reference")
        event = PaymentEvent.objects.get()
        self.assertIsNone(event.payment_id)
        self.assertEqual(event.processing_status, PaymentEvent.ProcessingStatus.IGNORED)
        self.assertEqual(len(event.payload_digest), 64)

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    def test_late_success_webhook_after_cancellation_requires_refund(self):
        order = self.create_order()
        payment = self.create_payment(order)
        transition_payment_status(payment.pk, Payment.Status.FAILED)
        cancel_order(str(order.public_reference), customer_id=order.customer_id)
        payload = {
            "event": "charge.success",
            "data": self.provider_transaction(payment),
        }

        response = self.paystack_webhook(payload)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["outcome"], "refund_required")
        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.REFUND_REQUIRED)
        self.assertEqual(order.status, Order.Status.CANCELLED)
        self.assertEqual(order.payment_status, Order.PaymentStatus.UNPAID)
        self.assertFalse(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.SALE,
            ).exists()
        )

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    def test_processed_full_refund_webhook_updates_payment_and_order(self):
        order = self.create_order()
        payment = self.create_payment(order)
        transaction_status = reconcile_verified_transaction(
            payment.pk,
            self.provider_transaction(payment),
        )
        self.assertEqual(transaction_status.outcome, "succeeded")
        payload = {
            "event": "refund.processed",
            "data": {
                "transaction_reference": payment.reference,
                "status": "processed",
                "amount": payment.amount_minor,
                "currency": payment.currency,
            },
        }

        response = self.paystack_webhook(payload)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["outcome"], "refunded")
        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.REFUNDED)
        self.assertEqual(order.payment_status, Order.PaymentStatus.REFUNDED)
        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.SALE,
                reference=str(order.public_reference),
            ).count(),
            1,
        )

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    def test_refund_amount_mismatch_requires_reconciliation(self):
        order = self.create_order()
        payment = self.create_payment(order)
        reconcile_verified_transaction(
            payment.pk,
            self.provider_transaction(payment),
        )
        payload = {
            "event": "refund.processed",
            "data": {
                "transaction_reference": payment.reference,
                "status": "processed",
                "amount": payment.amount_minor - 1,
                "currency": payment.currency,
            },
        }

        response = self.paystack_webhook(payload)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["outcome"],
            "reconciliation_required",
        )
        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(
            payment.status,
            Payment.Status.RECONCILIATION_REQUIRED,
        )
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    @patch("apps.orders.views.initiate_paystack_refund")
    def test_staff_refund_request_is_idempotent_and_waits_for_webhook(self, initiate):
        order = self.create_order()
        payment = self.create_payment(order)
        reconcile_verified_transaction(
            payment.pk,
            self.provider_transaction(payment),
        )
        staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            password="test-password",
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(user=staff_user)
        key = uuid4()
        url = reverse(
            "api:orders:staff-payment-refund",
            args=[payment.reference],
        )
        initiate.return_value = {"id": "provider-refund-001", "status": "processed"}

        first = self.client.post(
            url,
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(key),
        )
        retry = self.client.post(
            url,
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(key),
        )

        self.assertEqual(first.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(first.data["status"], PaymentRefund.Status.PENDING)
        self.assertEqual(first.data["amount_minor"], payment.amount_minor)
        self.assertEqual(retry.data, first.data)
        initiate.assert_called_once()
        payment.refresh_from_db()
        order.refresh_from_db()
        refund = PaymentRefund.objects.get(payment=payment)
        self.assertEqual(payment.status, Payment.Status.REFUND_PENDING)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(refund.provider_refund_id, "provider-refund-001")
        self.assertIsNone(refund.processed_at)

        payload = {
            "event": "refund.processed",
            "data": {
                "id": "provider-refund-001",
                "transaction_reference": payment.reference,
                "status": "processed",
                "amount": payment.amount_minor,
                "currency": payment.currency,
            },
        }
        webhook = self.paystack_webhook(payload)
        self.assertEqual(webhook.data["outcome"], "refunded")
        payment.refresh_from_db()
        order.refresh_from_db()
        refund.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.REFUNDED)
        self.assertEqual(order.payment_status, Order.PaymentStatus.REFUNDED)
        self.assertIsNotNone(refund.processed_at)

    @patch("apps.orders.views.initiate_paystack_refund")
    def test_ambiguous_refund_is_not_retried(self, initiate):
        order = self.create_order()
        payment = self.create_payment(order)
        reconcile_verified_transaction(
            payment.pk,
            self.provider_transaction(payment),
        )
        staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            password="test-password",
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(user=staff_user)
        key = uuid4()
        url = reverse(
            "api:orders:staff-payment-refund",
            args=[payment.reference],
        )
        initiate.side_effect = PaystackRefundError("ambiguous response")

        first = self.client.post(
            url,
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(key),
        )
        retry = self.client.post(
            url,
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(key),
        )

        self.assertEqual(first.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(first.data["status"], PaymentRefund.Status.INITIALIZING)
        self.assertEqual(retry.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(retry.data["reference"], first.data["reference"])
        initiate.assert_called_once()
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.REFUND_PENDING)
        self.assertEqual(
            PaymentRefund.objects.get(payment=payment).status,
            PaymentRefund.Status.INITIALIZING,
        )

    @patch("apps.orders.views.initiate_paystack_refund")
    def test_customers_cannot_request_refunds(self, initiate):
        order = self.create_order()
        payment = self.create_payment(order)
        response = self.client.post(
            reverse(
                "api:orders:staff-payment-refund",
                args=[payment.reference],
            ),
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(PaymentRefund.objects.exists())
        initiate.assert_not_called()

    def test_refund_endpoint_requires_idempotency_key(self):
        order = self.create_order()
        payment = self.create_payment(order)
        staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            password="test-password",
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(user=staff_user)

        response = self.client.post(
            reverse(
                "api:orders:staff-payment-refund",
                args=[payment.reference],
            ),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(PaymentRefund.objects.exists())

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    def test_pending_refund_is_persisted_and_blocks_completion_of_refund(self):
        order = self.create_order()
        payment = self.create_payment(order)
        reconcile_verified_transaction(
            payment.pk,
            self.provider_transaction(payment),
        )
        pending_payload = {
            "event": "refund.processed",
            "data": {
                "transaction_reference": payment.reference,
                "status": "pending",
                "amount": payment.amount_minor,
                "currency": payment.currency,
            },
        }

        pending_response = self.paystack_webhook(pending_payload)

        self.assertEqual(pending_response.data["outcome"], "refund_pending")
        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.REFUND_PENDING)
        self.assertIsNone(payment.refunded_at)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)

        processed_payload = {
            "event": "refund.processed",
            "data": {
                **pending_payload["data"],
                "status": "processed",
            },
        }
        processed_response = self.paystack_webhook(processed_payload)

        self.assertEqual(processed_response.data["outcome"], "refunded")
        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.REFUNDED)
        self.assertIsNotNone(payment.refunded_at)
        self.assertEqual(order.payment_status, Order.PaymentStatus.REFUNDED)

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    @patch("apps.orders.views.initiate_paystack_refund")
    def test_refund_webhook_completes_persisted_staff_refund_attempt(self, initiate):
        order = self.create_order()
        payment = self.create_payment(order)
        reconcile_verified_transaction(
            payment.pk,
            self.provider_transaction(payment),
        )
        staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            password="test-password",
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(user=staff_user)
        initiate.return_value = {"id": "provider-refund-002", "status": "pending"}
        request = self.client.post(
            reverse(
                "api:orders:staff-payment-refund",
                args=[payment.reference],
            ),
            {},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(request.status_code, status.HTTP_202_ACCEPTED)

        payload = {
            "event": "refund.processed",
            "data": {
                "id": "provider-refund-002",
                "transaction_reference": payment.reference,
                "status": "processed",
                "amount": payment.amount_minor,
                "currency": payment.currency,
            },
        }
        response = self.paystack_webhook(payload)

        self.assertEqual(response.data["outcome"], "refunded")
        payment.refresh_from_db()
        refund = PaymentRefund.objects.get(payment=payment)
        self.assertEqual(payment.status, Payment.Status.REFUNDED)
        self.assertEqual(refund.status, PaymentRefund.Status.PROCESSED)
        self.assertEqual(refund.provider_refund_id, "provider-refund-002")
        self.assertIsNotNone(refund.processed_at)

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    def test_failed_refund_webhook_requires_staff_reconciliation(self):
        order = self.create_order()
        payment = self.create_payment(order)
        reconcile_verified_transaction(
            payment.pk,
            self.provider_transaction(payment),
        )
        refund, created = create_payment_refund(payment.pk, uuid4(), None)
        self.assertTrue(created)
        payload = {
            "event": "refund.failed",
            "data": {
                "id": "provider-refund-failed",
                "transaction_reference": payment.reference,
                "status": "failed",
                "amount": payment.amount_minor,
                "currency": payment.currency,
            },
        }

        response = self.paystack_webhook(payload)

        self.assertEqual(response.data["outcome"], "reconciliation_required")
        payment.refresh_from_db()
        order.refresh_from_db()
        refund.refresh_from_db()
        self.assertEqual(
            payment.status,
            Payment.Status.RECONCILIATION_REQUIRED,
        )
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(
            refund.status,
            PaymentRefund.Status.RECONCILIATION_REQUIRED,
        )

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    def test_unknown_signed_webhook_event_is_ignored(self):
        response = self.paystack_webhook(
            {"event": "transfer.success", "data": {"id": 1}}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["outcome"], "ignored")
        self.assertEqual(
            PaymentEvent.objects.get().processing_status,
            PaymentEvent.ProcessingStatus.IGNORED,
        )


class PaystackClientTests(SimpleTestCase):
    def setUp(self):
        self.payment = type(
            "PaymentSnapshot",
            (),
            {
                "amount_minor": 2500,
                "currency": "GHS",
                "reference": "ws_test_reference",
                "provider_transaction_id": "",
            },
        )()
        self.authorization_url = "https://checkout.paystack.com/example"

    def paystack_response(self, *, reference=None, authorization_url=None):
        body = {
            "status": True,
            "data": {
                "reference": reference or self.payment.reference,
                "authorization_url": authorization_url or self.authorization_url,
            },
        }
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(body).encode("utf-8")
        return response

    def verification_response(self, **data_overrides):
        data = {
            "reference": self.payment.reference,
            "status": "success",
            "amount": 2500,
            "currency": "GHS",
            "id": 12345,
        }
        data.update(data_overrides)
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(
            {"status": True, "data": data}
        ).encode("utf-8")
        return response

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    @patch("apps.orders.paystack_client.build_opener")
    def test_initialization_posts_server_snapshot_to_fixed_paystack_url(
        self,
        build_opener,
    ):
        opener = MagicMock()
        opener.open.return_value = self.paystack_response()
        build_opener.return_value = opener

        result = initialize_transaction(
            self.payment,
            "shipping@example.com",
        )

        self.assertEqual(result, self.authorization_url)
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, PAYSTACK_INITIALIZE_URL)
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 10)
        self.assertEqual(
            json.loads(request.data),
            {
                "email": "shipping@example.com",
                "amount": 2500,
                "currency": "GHS",
                "reference": "ws_test_reference",
            },
        )
        self.assertEqual(request.get_header("Authorization"), "Bearer test-secret")

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    @patch("apps.orders.paystack_client.build_opener")
    def test_malformed_provider_response_is_rejected(self, build_opener):
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = b"not-json"
        opener = MagicMock()
        opener.open.return_value = response
        build_opener.return_value = opener

        with self.assertRaises(PaystackInitializationError):
            initialize_transaction(self.payment, "shipping@example.com")

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    @patch("apps.orders.paystack_client.build_opener")
    def test_timeout_keeps_client_result_ambiguous(self, build_opener):
        opener = MagicMock()
        opener.open.side_effect = TimeoutError()
        build_opener.return_value = opener

        with self.assertRaises(PaystackInitializationError):
            initialize_transaction(self.payment, "shipping@example.com")

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    @patch("apps.orders.paystack_client.build_opener")
    def test_non_success_http_response_is_rejected(self, build_opener):
        opener = MagicMock()
        opener.open.side_effect = HTTPError(
            PAYSTACK_INITIALIZE_URL,
            503,
            "Service Unavailable",
            hdrs=None,
            fp=None,
        )
        build_opener.return_value = opener

        with self.assertRaises(PaystackInitializationError):
            initialize_transaction(self.payment, "shipping@example.com")

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    @patch("apps.orders.paystack_client.build_opener")
    def test_mismatched_reference_or_non_paystack_url_is_rejected(self, build_opener):
        opener = MagicMock()
        build_opener.return_value = opener
        opener.open.return_value = self.paystack_response(reference="different")
        with self.assertRaises(PaystackInitializationError):
            initialize_transaction(self.payment, "shipping@example.com")

        opener.open.return_value = self.paystack_response(
            authorization_url="https://attacker.example/checkout"
        )
        with self.assertRaises(PaystackInitializationError):
            initialize_transaction(self.payment, "shipping@example.com")

    @patch("apps.orders.paystack_client.build_opener")
    def test_missing_secret_fails_without_network_call(self, build_opener):
        with override_settings(PAYSTACK_SECRET_KEY=""):
            with self.assertRaises(PaystackInitializationError):
                initialize_transaction(self.payment, "shipping@example.com")
        build_opener.assert_not_called()

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    @patch("apps.orders.paystack_client.build_opener")
    def test_verification_uses_fixed_host_and_returns_normalized_transaction(
        self,
        build_opener,
    ):
        opener = MagicMock()
        opener.open.return_value = self.verification_response()
        build_opener.return_value = opener

        result = verify_transaction(self.payment)

        request = opener.open.call_args.args[0]
        self.assertEqual(
            request.full_url,
            f"{PAYSTACK_API_BASE_URL}/transaction/verify/{self.payment.reference}",
        )
        self.assertEqual(request.get_method(), "GET")
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 10)
        self.assertEqual(request.get_header("Authorization"), "Bearer test-secret")
        self.assertEqual(
            result,
            {
                "reference": self.payment.reference,
                "status": "success",
                "amount": 2500,
                "currency": "GHS",
                "transaction_id": "12345",
            },
        )

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    @patch("apps.orders.paystack_client.build_opener")
    def test_verification_rejects_malformed_provider_data(self, build_opener):
        opener = MagicMock()
        opener.open.return_value = self.verification_response(amount="2500")
        build_opener.return_value = opener

        with self.assertRaises(PaystackVerificationError):
            verify_transaction(self.payment)

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    @patch("apps.orders.paystack_client.build_opener")
    def test_verification_timeout_is_ambiguous(self, build_opener):
        opener = MagicMock()
        opener.open.side_effect = TimeoutError()
        build_opener.return_value = opener

        with self.assertRaises(PaystackVerificationError):
            verify_transaction(self.payment)

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    @patch("apps.orders.paystack_client.build_opener")
    def test_refund_request_uses_fixed_host_and_authoritative_amount(
        self,
        build_opener,
    ):
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(
            {
                "status": True,
                "data": {"id": 789, "status": "pending"},
            }
        ).encode("utf-8")
        opener = MagicMock()
        opener.open.return_value = response
        build_opener.return_value = opener

        result = initiate_refund(self.payment)

        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, f"{PAYSTACK_API_BASE_URL}/refund")
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 10)
        self.assertEqual(request.get_header("Authorization"), "******")
        self.assertEqual(
            json.loads(request.data),
            {
                "transaction": self.payment.reference,
                "amount": self.payment.amount_minor,
                "currency": self.payment.currency,
            },
        )
        self.assertEqual(result, {"id": "789", "status": "pending"})

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    @patch("apps.orders.paystack_client.build_opener")
    def test_refund_timeout_is_ambiguous(self, build_opener):
        opener = MagicMock()
        opener.open.side_effect = TimeoutError()
        build_opener.return_value = opener

        with self.assertRaises(PaystackRefundError):
            initiate_refund(self.payment)

    @override_settings(PAYSTACK_SECRET_KEY="test-secret")
    def test_webhook_signature_validation_uses_sha512_hmac(self):
        body = b'{"event":"charge.success"}'
        signature = hmac.new(
            b"test-secret",
            body,
            hashlib.sha512,
        ).hexdigest()

        self.assertTrue(verify_webhook_signature(body, signature))
        self.assertFalse(verify_webhook_signature(body, "0" * 128))
        self.assertFalse(verify_webhook_signature(body, "not-a-signature"))

    @override_settings(PAYSTACK_SECRET_KEY="")
    def test_webhook_signature_validation_fails_closed_without_secret(self):
        with self.assertRaises(PaystackWebhookSignatureError):
            verify_webhook_signature(b"{}", "0" * 128)


class OrderConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.category = Category.objects.create(
            name="Concurrency parts",
            slug="order-concurrency-parts",
        )
        self.product = Product.objects.create(
            sku="ORDER-CONC-001",
            name="Concurrency part",
            slug="order-concurrency-part",
            category=self.category,
            product_type=Product.ProductType.SPARE_PART,
            sales_method=Product.SalesMethod.DIRECT_PURCHASE,
            publication_status=Product.PublicationStatus.PUBLISHED,
            price="10.00",
            weight_kg=Decimal("1.000"),
        )
        receive_stock(self.product.pk, 5, idempotency_key=uuid4())
        DeliveryZone.objects.create(
            code="accra",
            name="Accra delivery",
            city="Accra",
            region="Greater Accra",
            estimated_distance_km=Decimal("10.000"),
        )
        DeliveryPricingConfiguration.objects.create(
            version="concurrency-zero-rates-v1",
            is_active=True,
            base_fee=Decimal("0.00"),
            rate_per_km=Decimal("0.0000"),
            rate_per_kg=Decimal("0.0000"),
            minimum_fee=Decimal("0.00"),
        )
        self.customers = []
        for index in range(2):
            user = get_user_model().objects.create_user(
                username=uuid4().hex,
                password="Violet-River-82!",
            )
            customer = CustomerAccount.objects.create(
                user=user,
                email=f"concurrent-{index}@example.com",
            )
            cart = Cart.objects.create(customer=customer)
            CartItem.objects.create(cart=cart, product=self.product, quantity=4)
            self.customers.append(customer)

    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_checkouts_cannot_oversell(self):
        barrier = Barrier(2)
        shipping = {
            "full_name": "A customer",
            "email": "shipping@example.com",
            "phone": "+233200000000",
            "address_line_1": "1 Example Street",
            "address_line_2": "",
            "city": "Accra",
            "region": "Greater Accra",
            "postal_code": "",
            "country": "GH",
        }

        def checkout(customer):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                create_order_from_cart(customer.pk, uuid4(), shipping)
                return "created"
            except InsufficientStock:
                return "rejected"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(checkout, self.customers))

        self.assertCountEqual(results, ["created", "rejected"])
        inventory = InventoryRecord.objects.get(product=self.product)
        self.assertEqual(inventory.available_quantity, 1)
        self.assertEqual(inventory.reserved_quantity, 4)
        self.assertEqual(Order.objects.count(), 1)

    def create_reserved_order(self):
        shipping = {
            "full_name": "A customer",
            "email": "shipping@example.com",
            "phone": "+233200000000",
            "address_line_1": "1 Example Street",
            "address_line_2": "",
            "city": "Accra",
            "region": "Greater Accra",
            "postal_code": "",
            "country": "GH",
        }
        order, created = create_order_from_cart(
            self.customers[0].pk,
            uuid4(),
            shipping,
        )
        self.assertTrue(created)
        return order

    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_payment_attempt_retries_create_one_payment(self):
        order = self.create_reserved_order()
        idempotency_key = uuid4()
        barrier = Barrier(2)

        def create_attempt():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                payment, created = create_payment_attempt(
                    order.pk,
                    idempotency_key,
                )
                return payment.pk, created
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: create_attempt(), range(2)))

        self.assertEqual(results[0][0], results[1][0])
        self.assertCountEqual([created for _, created in results], [True, False])
        self.assertEqual(Payment.objects.filter(order=order).count(), 1)

    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_duplicate_webhooks_settle_stock_once(self):
        order = self.create_reserved_order()
        payment, _ = create_payment_attempt(order.pk, uuid4())
        payload_digest = "d" * 64
        provider_data = {
            "reference": payment.reference,
            "status": "success",
            "amount": payment.amount_minor,
            "currency": payment.currency,
            "id": 64003,
        }
        barrier = Barrier(2)

        def process_webhook():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return process_paystack_webhook(
                    "charge.success",
                    provider_data,
                    payload_digest,
                ).outcome
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(lambda _: process_webhook(), range(2)))

        self.assertCountEqual(outcomes, ["succeeded", "duplicate"])
        self.assertEqual(
            StockMovement.objects.filter(
                movement_type=StockMovement.MovementType.SALE,
                reference=str(order.public_reference),
            ).count(),
            1,
        )
        self.assertEqual(
            PaymentEvent.objects.filter(
                deduplication_key=f"webhook:{payload_digest}",
            ).count(),
            1,
        )
