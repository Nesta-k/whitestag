import hashlib
import json
from decimal import Decimal
from uuid import UUID

from django.db.models import Count, F, Prefetch, Q, Sum
from django.db import transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.exceptions import (
    APIException,
    NotFound,
    PermissionDenied,
    ValidationError,
)
from rest_framework.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateAPIView,
)
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.catalogue.pagination import CataloguePagination
from apps.customers.models import Cart, CustomerAccount
from apps.customers.permissions import IsAdminOrSuperadmin, IsSuperuser
from apps.inventory.services import InsufficientStock
from apps.inventory.models import InventoryRecord
from apps.inventory.serializers import InventoryRecordSerializer

from .models import (
    AfricanDeliveryCountry,
    DeliveryQuoteRequest,
    DeliveryPricingAuditLog,
    DeliveryPricingConfiguration,
    DeliverySpecialRule,
    DeliverySurcharge,
    DeliveryZone,
    GhanaRegionalDeliveryRate,
    InternationalDeliverySettings,
    Order,
    OrderItem,
    Payment,
    PaymentRefund,
)
from .pagination import OrderPagination
from .permissions import HasCustomerAccount
from .paystack_client import (
    PaystackInitializationError,
    PaystackRefundError,
    PaystackVerificationError,
    PaystackWebhookSignatureError,
    initialize_transaction as initialize_paystack_transaction,
    initiate_refund as initiate_paystack_refund,
    verify_transaction as verify_paystack_transaction,
    verify_webhook_signature,
)
from .payment_services import (
    InvalidPaymentVerification,
    PaymentConflict,
    PaymentOperationError,
    complete_payment_initialization,
    complete_payment_refund_request,
    create_payment_attempt,
    create_payment_refund,
    reconcile_verified_transaction,
    process_paystack_webhook,
)
from .serializers import (
    CheckoutInputSerializer,
    DeliveryQuoteInputSerializer,
    DeliveryQuoteRequestAdminSerializer,
    DeliveryQuoteRequestInputSerializer,
    DeliveryQuoteSerializer,
    DeliveryPricingAuditLogSerializer,
    InternationalDeliverySettingsSerializer,
    SuperuserAfricanDeliveryCountrySerializer,
    SuperuserDeliverySpecialRuleSerializer,
    SuperuserDeliveryPricingConfigurationSerializer,
    SuperuserGhanaRegionalDeliveryRateSerializer,
    SuperuserDeliverySurchargeSerializer,
    SuperuserDeliveryZoneSerializer,
    DeliveryZoneSerializer,
    OrderSerializer,
    PaymentInitializationResponseSerializer,
    PaymentVerificationResponseSerializer,
    PaymentRefundResponseSerializer,
    StaffPaymentSerializer,
)
from .services import (
    CheckoutConflict,
    CheckoutProductError,
    DeliveryPricingReviewRequired,
    EmptyCart,
    InvalidOrderTransition,
    cancel_order,
    complete_order,
    create_order_from_cart,
)
from .delivery_pricing import calculate_delivery_pricing


class OrderConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "order_conflict"


class PaymentInitializationUnavailable(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_code = "payment_initialization_unavailable"


class PaymentVerificationUnavailable(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_code = "payment_verification_unavailable"


class PaymentWebhookUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "payment_webhook_unavailable"


class PaymentRefundUnavailable(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_code = "payment_refund_unavailable"


def _order_queryset():
    return Order.objects.prefetch_related(
        Prefetch(
            "items",
            queryset=OrderItem.objects.select_related("product"),
        )
    )


class CheckoutView(APIView):
    permission_classes = [IsAuthenticated, HasCustomerAccount]

    def post(self, request):
        serializer = CheckoutInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key_value = request.headers.get("Idempotency-Key")
        try:
            idempotency_key = UUID(key_value) if key_value else None
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValidationError(
                {"Idempotency-Key": "A valid UUID idempotency key is required."}
            ) from exc
        if idempotency_key is None:
            raise ValidationError(
                {"Idempotency-Key": "A valid UUID idempotency key is required."}
            )

        shipping = {
            field: serializer.validated_data[field]
            for field in serializer.fields
        }
        try:
            order, created = create_order_from_cart(
                request.user.customer_account.pk,
                idempotency_key,
                shipping,
            )
        except EmptyCart as exc:
            raise ValidationError({"cart": str(exc)}) from exc
        except CheckoutProductError as exc:
            raise ValidationError({"cart": str(exc)}) from exc
        except DeliveryPricingReviewRequired as exc:
            raise ValidationError({"delivery_pricing": str(exc)}) from exc
        except CheckoutConflict as exc:
            raise OrderConflict(detail=str(exc)) from exc
        except InsufficientStock as exc:
            raise OrderConflict(detail=str(exc)) from exc

        response_status = (
            status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )
        return Response(OrderSerializer(order).data, status=response_status)


class DeliveryZoneListView(ListAPIView):
    serializer_class = DeliveryZoneSerializer
    permission_classes = [AllowAny]
    pagination_class = CataloguePagination
    queryset = DeliveryZone.objects.filter(is_active=True)


class DeliveryQuoteView(APIView):
    permission_classes = [IsAuthenticated, HasCustomerAccount]

    def post(self, request):
        serializer = DeliveryQuoteInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cart = (
            Cart.objects.filter(customer_id=request.user.customer_account.pk)
            .prefetch_related("items__product")
            .first()
        )
        if cart is None:
            raise ValidationError({"cart": "Your cart is empty."})
        items = list(cart.items.all())
        if not items:
            raise ValidationError({"cart": "Your cart is empty."})

        quote = calculate_delivery_pricing(
            serializer.validated_data,
            [(item.product, item.quantity) for item in items],
        )
        return Response(DeliveryQuoteSerializer(quote).data)


class DeliveryOptionsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "regions": list(
                    GhanaRegionalDeliveryRate.objects
                    .order_by("region_name")
                    .values(
                        "region_code",
                        "region_name",
                        "is_active",
                        "allow_fallback",
                    )
                ),
                "countries": list(
                    AfricanDeliveryCountry.objects.filter(is_active=True)
                    .order_by("country_name")
                    .values("country_code", "country_name")
                ),
                "international": InternationalDeliverySettingsSerializer(
                    InternationalDeliverySettings.load()
                ).data,
            }
        )


class DeliveryQuoteRequestView(APIView):
    permission_classes = [IsAuthenticated, HasCustomerAccount]

    @transaction.atomic
    def post(self, request):
        serializer = DeliveryQuoteRequestInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        customer_id = request.user.customer_account.pk
        existing = DeliveryQuoteRequest.objects.filter(
            customer_id=customer_id,
            idempotency_key=data["idempotency_key"],
        ).first()
        if existing:
            if any(
                getattr(existing, field) != value
                for field, value in data.items()
                if field != "idempotency_key"
            ):
                raise OrderConflict(
                    detail="This idempotency key was already used with different details."
                )
            return Response(
                {"reference": str(existing.reference), "status": existing.status},
                status=status.HTTP_200_OK,
            )

        country = data.get("country", "GH").upper()
        if country != "GH":
            if not AfricanDeliveryCountry.objects.filter(
                country_code=country,
                is_active=True,
            ).exists():
                raise ValidationError(
                    {"country": "Select an enabled African delivery country."}
                )
            settings_obj = InternationalDeliverySettings.objects.filter(pk=1).first()
            if settings_obj is None or not settings_obj.manual_quotes_enabled:
                raise ValidationError(
                    {"country": "International delivery quotations are unavailable."}
                )

        cart = (
            Cart.objects.select_for_update()
            .filter(customer_id=customer_id)
            .prefetch_related("items__product")
            .first()
        )
        if cart is None or not cart.items.exists():
            raise ValidationError({"cart": "Your cart is empty."})
        items = list(cart.items.all())
        quote = calculate_delivery_pricing(
            {
                "city": data["city"],
                "region": data["region"],
                "country": country,
            },
            [(item.product, item.quantity) for item in items],
            lock_rows=True,
        )
        if not quote["requires_manual_review"]:
            raise ValidationError(
                {
                    "delivery_pricing": (
                        "This destination can be checked out with automatic pricing."
                    )
                }
            )
        if country != "GH" and quote.get("quote_request_available") is not True:
            raise ValidationError({"country": quote["review_reason"]})

        item_snapshot = [
            {
                "product_id": item.product_id,
                "name": item.product.name,
                "sku": item.product.sku,
                "quantity": item.quantity,
                "unit_price": str(item.product.price) if item.product.price else None,
                "currency": item.product.currency,
                "weight_kg": (
                    str(item.product.weight_kg)
                    if item.product.weight_kg is not None
                    else None
                ),
            }
            for item in items
        ]
        quote_request, created = DeliveryQuoteRequest.objects.get_or_create(
            customer_id=customer_id,
            idempotency_key=data["idempotency_key"],
            defaults={
                "reason": (
                    quote["review_reason"]
                    or "Manual delivery quotation requested."
                )[:255],
                "full_name": data["full_name"],
                "email": data["email"],
                "phone": data["phone"],
                "address_line_1": data["address_line_1"],
                "address_line_2": data["address_line_2"],
                "city": data["city"],
                "region": data["region"],
                "country": country,
                "postal_code": data["postal_code"],
                "items_snapshot": item_snapshot,
                "pricing_snapshot": quote,
            },
        )
        if not created and (
            any(
                getattr(quote_request, field) != value
                for field, value in data.items()
                if field != "idempotency_key"
            )
            or quote_request.items_snapshot != item_snapshot
        ):
            raise OrderConflict(
                detail="This idempotency key was already used with different details."
            )
        if created:
            DeliveryPricingAuditLog.objects.create(
                configuration_type=DeliveryPricingAuditLog.ConfigurationType.QUOTE_REQUEST,
                object_id=str(quote_request.reference),
                object_label=str(quote_request.reference),
                action=DeliveryPricingAuditLog.Action.CREATED,
                actor=request.user,
                before_state=None,
                after_state=DeliveryQuoteRequestAdminSerializer(quote_request).data,
            )
        return Response(
            {
                "reference": str(quote_request.reference),
                "status": quote_request.status,
            },
            status=(
                status.HTTP_201_CREATED if created else status.HTTP_200_OK
            ),
        )


class OrderPaymentInitializationView(APIView):
    permission_classes = [IsAuthenticated, HasCustomerAccount]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "payment_initialize"

    def post(self, request, public_reference):
        if request.user.is_staff:
            raise PermissionDenied(
                "Staff cannot initialize customer payments."
            )

        key_value = request.headers.get("Idempotency-Key", "")
        try:
            if len(key_value) != 36:
                raise ValueError("Invalid idempotency key length.")
            idempotency_key = UUID(key_value)
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValidationError(
                {
                    "Idempotency-Key": (
                        "A UUID idempotency key (36 characters) is required."
                    )
                }
            ) from exc

        order = Order.objects.filter(
            customer_id=request.user.customer_account.pk,
            public_reference=public_reference,
        ).first()
        if order is None:
            raise NotFound("Order not found.")

        try:
            payment, created = create_payment_attempt(
                order.pk,
                idempotency_key,
            )
        except PaymentOperationError as exc:
            raise OrderConflict(detail=str(exc)) from exc

        if not created:
            response_status = (
                status.HTTP_200_OK
                if payment.status == Payment.Status.PENDING
                else status.HTTP_202_ACCEPTED
            )
            return Response(
                PaymentInitializationResponseSerializer(payment).data,
                status=response_status,
            )

        try:
            authorization_url = initialize_paystack_transaction(
                payment,
                order.shipping_email,
            )
            payment, _ = complete_payment_initialization(
                payment.pk,
                authorization_url,
            )
        except PaystackInitializationError as exc:
            raise PaymentInitializationUnavailable(
                {
                    "reference": payment.reference,
                    "status": payment.status,
                    "authorization_url": None,
                }
            ) from exc
        except PaymentConflict as exc:
            raise OrderConflict(detail=str(exc)) from exc

        return Response(
            PaymentInitializationResponseSerializer(payment).data,
            status=status.HTTP_201_CREATED,
        )


class PaymentVerificationView(APIView):
    permission_classes = [IsAuthenticated, HasCustomerAccount]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "payment_verify"

    def post(self, request, payment_reference):
        if request.user.is_staff:
            raise PermissionDenied("Staff cannot verify customer payments.")

        payment = (
            Payment.objects.select_related("order")
            .filter(
                reference=payment_reference,
                order__customer_id=request.user.customer_account.pk,
            )
            .first()
        )
        if payment is None:
            raise NotFound("Payment not found.")

        if payment.status == Payment.Status.SUCCEEDED:
            return Response(
                PaymentVerificationResponseSerializer(
                    {
                        "reference": payment.reference,
                        "status": payment.status,
                        "outcome": "succeeded",
                    }
                ).data
            )

        try:
            transaction_data = verify_paystack_transaction(payment)
            result = reconcile_verified_transaction(
                payment.pk,
                transaction_data,
            )
        except PaystackVerificationError as exc:
            raise PaymentVerificationUnavailable(
                {
                    "reference": payment.reference,
                    "status": payment.status,
                    "outcome": "inconclusive",
                }
            ) from exc
        except InvalidPaymentVerification as exc:
            raise PaymentVerificationUnavailable(
                {
                    "reference": payment.reference,
                    "status": payment.status,
                    "outcome": "inconclusive",
                }
            ) from exc
        except PaymentOperationError as exc:
            raise OrderConflict(detail=str(exc)) from exc

        response_data = {
            "reference": result.payment.reference,
            "status": result.payment.status,
            "outcome": result.outcome,
        }
        return Response(PaymentVerificationResponseSerializer(response_data).data)


@method_decorator(csrf_exempt, name="dispatch")
class PaystackWebhookView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = []
    throttle_classes = []

    def post(self, request):
        content_length = request.headers.get("Content-Length")
        if content_length:
            try:
                if int(content_length) > 65536:
                    return Response(
                        {"detail": "Webhook payload is too large."},
                        status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    )
            except ValueError:
                raise ValidationError({"detail": "Invalid Content-Length."})
        if request.content_type != "application/json":
            return Response(
                {"detail": "Content-Type must be application/json."},
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            )

        payload = request.body
        if len(payload) > 65536:
            return Response(
                {"detail": "Webhook payload is too large."},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        signature = request.headers.get("x-paystack-signature", "")
        try:
            signature_valid = verify_webhook_signature(payload, signature)
        except PaystackWebhookSignatureError as exc:
            raise PaymentWebhookUnavailable(
                "Paystack webhook verification is not configured."
            ) from exc
        if not signature_valid:
            return Response(
                {"detail": "Invalid webhook signature."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            webhook_payload = json.loads(payload)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValidationError({"detail": "Invalid JSON webhook payload."}) from exc
        if not isinstance(webhook_payload, dict):
            raise ValidationError({"detail": "Invalid webhook payload."})

        event_type = webhook_payload.get("event")
        provider_data = webhook_payload.get("data")
        if not isinstance(event_type, str) or not isinstance(provider_data, dict):
            raise ValidationError({"detail": "Invalid webhook payload."})

        result = process_paystack_webhook(
            event_type,
            provider_data,
            hashlib.sha256(payload).hexdigest(),
        )
        return Response(
            {"status": "accepted", "outcome": result.outcome},
            status=status.HTTP_200_OK,
        )


class CustomerOrderListView(ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = OrderPagination

    def get_queryset(self):
        if self.request.user.is_staff:
            return _order_queryset()
        try:
            customer = self.request.user.customer_account
        except CustomerAccount.DoesNotExist:
            return Order.objects.none()
        return _order_queryset().filter(customer=customer)


class OrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, public_reference):
        orders = _order_queryset()
        if not request.user.is_staff:
            try:
                customer = request.user.customer_account
            except CustomerAccount.DoesNotExist:
                raise NotFound("Order not found.")
            orders = orders.filter(customer=customer)
        order = orders.filter(public_reference=public_reference).first()
        if order is None:
            raise NotFound("Order not found.")
        return Response(OrderSerializer(order).data)


class OrderCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, public_reference):
        customer_id = None
        if not request.user.is_staff:
            try:
                customer_id = request.user.customer_account.pk
            except CustomerAccount.DoesNotExist as exc:
                raise NotFound("Order not found.") from exc

        try:
            result = cancel_order(
                public_reference,
                customer_id=customer_id,
            )
        except InvalidOrderTransition as exc:
            raise OrderConflict(detail=str(exc)) from exc
        if result is None:
            raise NotFound("Order not found.")
        order, _ = result
        return Response(OrderSerializer(order).data)


class StaffOrderListView(ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [IsAdminUser]
    pagination_class = OrderPagination
    queryset = _order_queryset()


class StaffOrderCompleteView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, public_reference):
        try:
            order, _ = complete_order(public_reference)
        except InvalidOrderTransition as exc:
            raise OrderConflict(detail=str(exc)) from exc
        if order is None:
            raise NotFound("Order not found.")
        return Response(OrderSerializer(order).data)


class StaffPaymentListView(ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = StaffPaymentSerializer
    pagination_class = OrderPagination

    def get_queryset(self):
        queryset = Payment.objects.select_related("order").order_by(
            "-created_at",
            "-pk",
        )
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(reference__icontains=search)
                | Q(order__shipping_email__icontains=search)
                | Q(order__public_reference__icontains=search)
            )
        return queryset


class StaffDeliveryPricingView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        def serialize_configuration(configuration):
            return {
                "version": configuration.version,
                "id": configuration.pk,
                "is_active": configuration.is_active,
                "currency": configuration.currency,
                "base_fee": str(configuration.base_fee),
                "rate_per_km": str(configuration.rate_per_km),
                "rate_per_kg": str(configuration.rate_per_kg),
                "minimum_fee": str(configuration.minimum_fee),
                "maximum_fee": (
                    str(configuration.maximum_fee)
                    if configuration.maximum_fee is not None
                    else None
                ),
                "rounding_mode": configuration.rounding_mode,
                "review_weight_threshold_kg": (
                    str(configuration.review_weight_threshold_kg)
                    if configuration.review_weight_threshold_kg is not None
                    else None
                ),
                "review_distance_threshold_km": (
                    str(configuration.review_distance_threshold_km)
                    if configuration.review_distance_threshold_km is not None
                    else None
                ),
                "review_fee_threshold": (
                    str(configuration.review_fee_threshold)
                    if configuration.review_fee_threshold is not None
                    else None
                ),
            }
        configurations = list(
            DeliveryPricingConfiguration.objects.order_by("-updated_at", "-pk")
        )
        active_configuration = next(
            (serialize_configuration(item) for item in configurations if item.is_active),
            None,
        )
        zones = DeliveryZone.objects.order_by("region", "city", "name")
        surcharges = DeliverySurcharge.objects.select_related("zone").order_by(
            "name",
            "pk",
        )
        return Response(
            {
                "active_configuration": active_configuration,
                "configurations": [
                    serialize_configuration(item) for item in configurations
                ],
                "zones": [
                    {
                        "id": zone.pk,
                        "code": zone.code,
                        "name": zone.name,
                        "city": zone.city,
                        "region": zone.region,
                        "estimated_distance_km": (
                            str(zone.estimated_distance_km)
                            if zone.estimated_distance_km is not None
                            else None
                        ),
                        "is_active": zone.is_active,
                    }
                    for zone in zones
                ],
                "surcharges": [
                    {
                        "id": surcharge.pk,
                        "code": surcharge.code,
                        "name": surcharge.name,
                        "amount": str(surcharge.amount),
                        "zone_code": (
                            surcharge.zone.code if surcharge.zone else None
                        ),
                        "zone_id": surcharge.zone_id,
                        "is_active": surcharge.is_active,
                    }
                    for surcharge in surcharges
                ],
            }
        )


class SuperuserPricingAuditMixin:
    audit_type = None

    def _record_audit(self, instance, action, before_state, after_state):
        DeliveryPricingAuditLog.objects.create(
            configuration_type=self.audit_type,
            object_id=str(instance.pk),
            object_label=str(instance),
            action=action,
            actor=self.request.user,
            before_state=before_state,
            after_state=after_state,
        )

    def perform_create(self, serializer):
        instance = serializer.save()
        self._record_audit(
            instance,
            DeliveryPricingAuditLog.Action.CREATED,
            None,
            serializer.__class__(instance).data,
        )

    def perform_update(self, serializer):
        before_state = serializer.__class__(serializer.instance).data
        instance = serializer.save()
        after_state = serializer.__class__(instance).data
        if before_state != after_state:
            self._record_audit(
                instance,
                DeliveryPricingAuditLog.Action.UPDATED,
                before_state,
                after_state,
            )


class SuperuserPricingConfigurationListCreateView(
    SuperuserPricingAuditMixin,
    ListCreateAPIView,
):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserDeliveryPricingConfigurationSerializer
    pagination_class = CataloguePagination
    queryset = DeliveryPricingConfiguration.objects.order_by("-updated_at", "-pk")
    audit_type = DeliveryPricingAuditLog.ConfigurationType.PRICING


class SuperuserPricingConfigurationDetailView(
    SuperuserPricingAuditMixin,
    RetrieveUpdateAPIView,
):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserDeliveryPricingConfigurationSerializer
    queryset = DeliveryPricingConfiguration.objects.all()
    audit_type = DeliveryPricingAuditLog.ConfigurationType.PRICING


class SuperuserDeliveryZoneListCreateView(
    SuperuserPricingAuditMixin,
    ListCreateAPIView,
):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserDeliveryZoneSerializer
    pagination_class = CataloguePagination
    queryset = DeliveryZone.objects.order_by("region", "city", "name")
    audit_type = DeliveryPricingAuditLog.ConfigurationType.ZONE


class SuperuserDeliveryZoneDetailView(
    SuperuserPricingAuditMixin,
    RetrieveUpdateAPIView,
):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserDeliveryZoneSerializer
    queryset = DeliveryZone.objects.all()
    audit_type = DeliveryPricingAuditLog.ConfigurationType.ZONE


class SuperuserDeliverySurchargeListCreateView(
    SuperuserPricingAuditMixin,
    ListCreateAPIView,
):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserDeliverySurchargeSerializer
    pagination_class = CataloguePagination
    queryset = DeliverySurcharge.objects.select_related("zone").order_by("name", "pk")
    audit_type = DeliveryPricingAuditLog.ConfigurationType.SURCHARGE


class SuperuserDeliverySurchargeDetailView(
    SuperuserPricingAuditMixin,
    RetrieveUpdateAPIView,
):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserDeliverySurchargeSerializer
    queryset = DeliverySurcharge.objects.select_related("zone").all()
    audit_type = DeliveryPricingAuditLog.ConfigurationType.SURCHARGE


class SuperuserRegionalRateListView(ListAPIView):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserGhanaRegionalDeliveryRateSerializer
    pagination_class = CataloguePagination
    queryset = GhanaRegionalDeliveryRate.objects.order_by("region_name", "pk")


class SuperuserRegionalRateDetailView(
    SuperuserPricingAuditMixin,
    RetrieveUpdateAPIView,
):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserGhanaRegionalDeliveryRateSerializer
    queryset = GhanaRegionalDeliveryRate.objects.all()
    audit_type = DeliveryPricingAuditLog.ConfigurationType.REGION


class SuperuserAfricanCountryListView(ListAPIView):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserAfricanDeliveryCountrySerializer
    pagination_class = CataloguePagination
    queryset = AfricanDeliveryCountry.objects.order_by("country_name", "pk")


class SuperuserAfricanCountryDetailView(
    SuperuserPricingAuditMixin,
    RetrieveUpdateAPIView,
):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserAfricanDeliveryCountrySerializer
    queryset = AfricanDeliveryCountry.objects.all()
    audit_type = DeliveryPricingAuditLog.ConfigurationType.COUNTRY


class SuperuserDeliverySpecialRuleListView(
    SuperuserPricingAuditMixin,
    ListCreateAPIView,
):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserDeliverySpecialRuleSerializer
    pagination_class = CataloguePagination
    queryset = DeliverySpecialRule.objects.order_by("name", "pk")
    audit_type = DeliveryPricingAuditLog.ConfigurationType.RULE


class SuperuserDeliverySpecialRuleDetailView(
    SuperuserPricingAuditMixin,
    RetrieveUpdateAPIView,
):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserDeliverySpecialRuleSerializer
    queryset = DeliverySpecialRule.objects.all()
    audit_type = DeliveryPricingAuditLog.ConfigurationType.RULE


class SuperuserInternationalDeliverySettingsView(APIView):
    permission_classes = [IsAdminOrSuperadmin]

    def get(self, request):
        return Response(InternationalDeliverySettingsSerializer(
            InternationalDeliverySettings.load()
        ).data)

    def patch(self, request):
        instance = InternationalDeliverySettings.load()
        serializer = InternationalDeliverySettingsSerializer(
            instance,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        before_state = InternationalDeliverySettingsSerializer(instance).data
        instance = serializer.save()
        after_state = InternationalDeliverySettingsSerializer(instance).data
        if before_state != after_state:
            DeliveryPricingAuditLog.objects.create(
                configuration_type=DeliveryPricingAuditLog.ConfigurationType.INTL_SETTINGS,
                object_id="1",
                object_label="International delivery settings",
                action=DeliveryPricingAuditLog.Action.UPDATED,
                actor=request.user,
                before_state=before_state,
                after_state=after_state,
            )
        return Response(after_state)


class SuperuserDeliveryQuoteRequestListView(ListAPIView):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = DeliveryQuoteRequestAdminSerializer
    pagination_class = CataloguePagination
    queryset = DeliveryQuoteRequest.objects.select_related("customer").order_by(
        "-created_at",
        "-pk",
    )

    def get_queryset(self):
        queryset = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset


class SuperuserDeliveryQuoteRequestDetailView(
    SuperuserPricingAuditMixin,
    RetrieveUpdateAPIView,
):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = DeliveryQuoteRequestAdminSerializer
    queryset = DeliveryQuoteRequest.objects.select_related("customer").all()
    audit_type = DeliveryPricingAuditLog.ConfigurationType.QUOTE_REQUEST
    lookup_field = "reference"
    lookup_url_kwarg = "pk"


class SuperuserDeliveryPricingAuditListView(ListAPIView):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = DeliveryPricingAuditLogSerializer
    pagination_class = CataloguePagination
    queryset = DeliveryPricingAuditLog.objects.select_related("actor").all()


class StaffDashboardOverviewView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        order_status_counts = {
            entry["status"]: entry["count"]
            for entry in Order.objects.values("status").annotate(count=Count("pk"))
        }
        order_payment_counts = {
            entry["payment_status"]: entry["count"]
            for entry in Order.objects.values("payment_status").annotate(
                count=Count("pk")
            )
        }
        paid_revenue = (
            Order.objects.filter(payment_status=Order.PaymentStatus.PAID)
            .exclude(status__in=[Order.Status.CANCELLED, Order.Status.EXPIRED])
            .aggregate(value=Sum("total"))["value"]
        )
        paid_revenue = paid_revenue or Decimal("0.00")
        recent_orders = _order_queryset()[:8]
        low_stock = (
            InventoryRecord.objects.select_related("product")
            .filter(available_quantity__lte=F("reorder_threshold"))
            .order_by("available_quantity", "product__name")[:10]
        )
        low_stock_count = InventoryRecord.objects.filter(
            available_quantity__lte=F("reorder_threshold")
        ).count()
        return Response(
            {
                "orders_by_status": order_status_counts,
                "orders_by_payment_status": order_payment_counts,
                "paid_revenue": f"{paid_revenue:.2f}",
                "currency": "GHS",
                "recent_orders": OrderSerializer(recent_orders, many=True).data,
                "low_stock": InventoryRecordSerializer(
                    low_stock,
                    many=True,
                ).data,
                "low_stock_count": low_stock_count,
                "unavailable_features": [
                    "preorders",
                ],
            }
        )


class StaffPaymentRefundView(APIView):
    permission_classes = [IsAdminOrSuperadmin]

    def post(self, request, payment_reference):
        key_value = request.headers.get("Idempotency-Key", "")
        try:
            if len(key_value) != 36:
                raise ValueError("Invalid idempotency key length.")
            idempotency_key = UUID(key_value)
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValidationError(
                {"Idempotency-Key": "A UUID idempotency key is required."}
            ) from exc

        payment = Payment.objects.filter(reference=payment_reference).first()
        if payment is None:
            raise NotFound("Payment not found.")
        try:
            refund, created = create_payment_refund(
                payment.pk,
                idempotency_key,
                request.user,
            )
        except PaymentOperationError as exc:
            raise OrderConflict(detail=str(exc)) from exc

        if not created:
            response_status = (
                status.HTTP_200_OK
                if refund.status == PaymentRefund.Status.PROCESSED
                else status.HTTP_202_ACCEPTED
            )
            return Response(
                PaymentRefundResponseSerializer(refund).data,
                status=response_status,
            )

        try:
            provider_result = initiate_paystack_refund(refund.payment)
            result = complete_payment_refund_request(
                refund.pk,
                provider_result,
            )
        except PaystackRefundError as exc:
            raise PaymentRefundUnavailable(
                {
                    "reference": refund.reference,
                    "status": refund.status,
                }
            ) from exc
        except PaymentOperationError as exc:
            raise OrderConflict(detail=str(exc)) from exc

        return Response(
            PaymentRefundResponseSerializer(result.refund).data,
            status=(
                status.HTTP_200_OK
                if result.outcome == "refunded"
                else status.HTTP_202_ACCEPTED
            ),
        )
