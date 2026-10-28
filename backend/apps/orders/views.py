import hashlib
import json
from uuid import UUID

from django.db.models import Prefetch
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.exceptions import (
    APIException,
    NotFound,
    PermissionDenied,
    ValidationError,
)
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.catalogue.pagination import CataloguePagination
from apps.customers.models import Cart, CustomerAccount
from apps.inventory.services import InsufficientStock

from .models import DeliveryZone, Order, OrderItem, Payment, PaymentRefund
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
    DeliveryQuoteSerializer,
    DeliveryZoneSerializer,
    OrderSerializer,
    PaymentInitializationResponseSerializer,
    PaymentVerificationResponseSerializer,
    PaymentRefundResponseSerializer,
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


class StaffPaymentRefundView(APIView):
    permission_classes = [IsAdminUser]

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
