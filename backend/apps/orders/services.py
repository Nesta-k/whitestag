from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5

from django.db import transaction

from apps.catalogue.models import Product
from apps.customers.models import Cart, CartItem
from apps.inventory.models import InventoryRecord
from apps.inventory.services import (
    IdempotencyConflict,
    InsufficientStock,
    reserve_stock,
    release_reservation,
)

from .models import (
    CURRENCY_MINOR_UNIT_MULTIPLIERS,
    DeliveryZone,
    Order,
    OrderItem,
    Payment,
)
from .delivery_pricing import calculate_delivery_pricing


ZERO = Decimal("0.00")


class OrderOperationError(Exception):
    pass


class EmptyCart(OrderOperationError):
    pass


class CheckoutConflict(OrderOperationError):
    pass


class CheckoutProductError(OrderOperationError):
    pass


class DeliveryPricingReviewRequired(OrderOperationError):
    pass


class InvalidOrderTransition(OrderOperationError):
    pass


def _shipping_matches(order, shipping):
    return all(
        getattr(order, f"shipping_{field}") == value
        for field, value in shipping.items()
    )


def _validate_product(product):
    if (
        product.publication_status != Product.PublicationStatus.PUBLISHED
        or product.product_type != Product.ProductType.SPARE_PART
        or product.sales_method != Product.SalesMethod.DIRECT_PURCHASE
        or product.price is None
        or product.price <= ZERO
        or product.currency not in CURRENCY_MINOR_UNIT_MULTIPLIERS
    ):
        raise CheckoutProductError(
            "The cart contains a product that is no longer available for purchase."
        )


def create_order_from_cart(customer_id, idempotency_key, shipping):
    with transaction.atomic():
        cart = Cart.objects.select_for_update().get(customer_id=customer_id)

        if idempotency_key is not None:
            existing = Order.objects.filter(
                customer_id=customer_id,
                idempotency_key=idempotency_key,
            ).first()
            if existing is not None:
                if not _shipping_matches(existing, shipping):
                    raise CheckoutConflict(
                        "This idempotency key was already used with different details."
                    )
                return existing, False

        cart_items = list(
            CartItem.objects.select_for_update()
            .filter(cart=cart)
            .order_by("product_id", "pk")
        )
        if not cart_items:
            raise EmptyCart("The cart is empty.")

        product_ids = sorted({item.product_id for item in cart_items})
        products = {
            product.pk: product
            for product in Product.objects.select_for_update()
            .filter(pk__in=product_ids)
            .order_by("pk")
        }
        inventory_records = {
            record.product_id: record
            for record in InventoryRecord.objects.select_for_update()
            .filter(product_id__in=product_ids)
            .order_by("product_id")
        }

        lines = []
        subtotal = ZERO
        currencies = set()
        for item in cart_items:
            product = products.get(item.product_id)
            if product is None:
                raise CheckoutProductError(
                    "The cart contains a product that is no longer available."
                )
            _validate_product(product)
            inventory = inventory_records.get(product.pk)
            if inventory is None or inventory.available_quantity < item.quantity:
                raise InsufficientStock("The cart contains insufficient stock.")
            line_total = product.price * item.quantity
            lines.append((item, product, line_total))
            subtotal += line_total
            currencies.add(product.currency)

        if len(currencies) != 1:
            raise CheckoutProductError(
                "Products with different currencies cannot be checked out together."
            )

        delivery_quote = calculate_delivery_pricing(
            shipping,
            [(product, item.quantity) for item, product, _ in lines],
            lock_rows=True,
        )
        if delivery_quote["requires_manual_review"]:
            raise DeliveryPricingReviewRequired(
                delivery_quote["review_reason"]
            )
        delivery_fee = Decimal(delivery_quote["delivery_fee"])
        delivery_zone_code = delivery_quote["destination"]["zone_code"]
        delivery_quote["order_total"] = str(subtotal + delivery_fee)
        delivery_zone = DeliveryZone.objects.get(code=delivery_zone_code)
        delivery_zone_name = delivery_zone.name
        discount = ZERO
        order = Order.objects.create(
            customer_id=customer_id,
            idempotency_key=idempotency_key,
            status=Order.Status.PENDING,
            payment_status=Order.PaymentStatus.UNPAID,
            currency=currencies.pop(),
            subtotal=subtotal,
            delivery_fee=delivery_fee,
            discount=discount,
            total=subtotal + delivery_fee - discount,
            delivery_zone=delivery_zone,
            delivery_zone_code=delivery_zone_code,
            delivery_zone_name=delivery_zone_name,
            shipment_weight_kg=Decimal(delivery_quote["shipment_weight_kg"]),
            estimated_distance_km=Decimal(
                delivery_quote["estimated_distance_km"]
            ),
            delivery_distance_source=delivery_quote["distance_source"],
            delivery_pricing_snapshot=delivery_quote,
            **{f"shipping_{field}": value for field, value in shipping.items()},
        )

        order_items = [
            OrderItem(
                order=order,
                product=product,
                product_name=product.name,
                product_sku=product.sku,
                quantity=item.quantity,
                unit_price=product.price,
                line_total=line_total,
                product_weight_kg=product.weight_kg,
            )
            for item, product, line_total in lines
        ]
        OrderItem.objects.bulk_create(order_items)

        for item in order.items.order_by("product_id", "pk"):
            try:
                reserve_stock(
                    item.product_id,
                    item.quantity,
                    idempotency_key=item.reservation_key,
                    reason="Order reservation",
                    reference=str(order.public_reference),
                )
            except IdempotencyConflict as exc:
                raise CheckoutConflict(
                    "A stock reservation key conflicts with an existing movement."
                ) from exc

        cart.items.all().delete()
        return order, True


def _cancellation_key(order_item):
    return uuid5(
        NAMESPACE_URL,
        f"whitestag:order:{order_item.order.public_reference}:release:{order_item.pk}",
    )


def _expiry_key(order_item):
    return uuid5(
        NAMESPACE_URL,
        f"whitestag:order:{order_item.order.public_reference}:expire:{order_item.pk}",
    )


def cancel_order(public_reference, customer_id=None):
    with transaction.atomic():
        orders = Order.objects.select_for_update().filter(
            public_reference=public_reference
        )
        if customer_id is not None:
            orders = orders.filter(customer_id=customer_id)
        order = orders.first()
        if order is None:
            return None

        if order.status == Order.Status.CANCELLED:
            return order, False
        if (
            order.status != Order.Status.PENDING
            or order.payment_status != Order.PaymentStatus.UNPAID
        ):
            raise InvalidOrderTransition(
                "Only unpaid pending orders can be cancelled."
            )
        if Payment.objects.filter(
            order=order,
            status__in=[
                Payment.Status.INITIALIZING,
                Payment.Status.PENDING,
                Payment.Status.SUCCEEDED,
                Payment.Status.REFUND_PENDING,
                Payment.Status.REFUND_REQUIRED,
                Payment.Status.RECONCILIATION_REQUIRED,
            ],
        ).exists():
            raise InvalidOrderTransition(
                "Orders with unresolved payment attempts cannot be cancelled."
            )

        items = list(order.items.order_by("product_id", "pk"))
        for item in items:
            release_reservation(
                item.product_id,
                item.quantity,
                idempotency_key=_cancellation_key(item),
                reason="Order cancelled",
                reference=str(order.public_reference),
            )

        order.status = Order.Status.CANCELLED
        order.save(update_fields=["status", "updated_at"])
        return order, True


def expire_unpaid_orders(cutoff, *, limit=100):
    if limit <= 0:
        raise ValueError("The order expiry limit must be positive.")

    candidates = list(
        Order.objects.filter(
            status=Order.Status.PENDING,
            payment_status=Order.PaymentStatus.UNPAID,
            created_at__lt=cutoff,
        )
        .order_by("created_at", "pk")
        .values_list("pk", flat=True)[:limit]
    )
    expired_ids = []
    blocking_payment_statuses = [
        Payment.Status.INITIALIZING,
        Payment.Status.PENDING,
        Payment.Status.SUCCEEDED,
        Payment.Status.REFUND_PENDING,
        Payment.Status.REFUND_REQUIRED,
        Payment.Status.REFUNDED,
        Payment.Status.RECONCILIATION_REQUIRED,
    ]

    for order_id in candidates:
        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order_id)
            if (
                order.status != Order.Status.PENDING
                or order.payment_status != Order.PaymentStatus.UNPAID
                or order.created_at >= cutoff
                or Payment.objects.filter(
                    order=order,
                    status__in=blocking_payment_statuses,
                ).exists()
            ):
                continue

            items = list(order.items.order_by("product_id", "pk"))
            for item in items:
                release_reservation(
                    item.product_id,
                    item.quantity,
                    idempotency_key=_expiry_key(item),
                    reason="Unpaid order expired",
                    reference=str(order.public_reference),
                )
            order.status = Order.Status.EXPIRED
            order.save(update_fields=["status", "updated_at"])
            expired_ids.append(order.pk)

    return expired_ids


def complete_order(public_reference):
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(
            public_reference=public_reference,
        ).first()
        if order is None:
            return None, False
        if order.status == Order.Status.COMPLETED:
            return order, False
        if (
            order.status != Order.Status.PROCESSING
            or order.payment_status != Order.PaymentStatus.PAID
        ):
            raise InvalidOrderTransition(
                "Only paid processing orders can be completed."
            )
        order.status = Order.Status.COMPLETED
        order.save(update_fields=["status", "updated_at"])
        return order, True
