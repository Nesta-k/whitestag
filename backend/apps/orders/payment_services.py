from dataclasses import dataclass
import hashlib
import json
from uuid import NAMESPACE_URL, uuid5

from django.db import transaction
from django.utils import timezone

from apps.inventory.services import StockOperationError, record_sale

from .models import (
    CURRENCY_MINOR_UNIT_MULTIPLIERS,
    Order,
    Payment,
    PaymentEvent,
    PaymentRefund,
    amount_to_minor_units,
)


class PaymentOperationError(Exception):
    pass


class PaymentConflict(PaymentOperationError):
    pass


class InvalidPaymentTransition(PaymentOperationError):
    pass


class UnsupportedPaymentCurrency(PaymentOperationError):
    pass


class InvalidPaymentAmount(PaymentOperationError):
    pass


class PaymentInitializationConflict(PaymentConflict):
    pass


class InvalidPaymentVerification(PaymentOperationError):
    pass


@dataclass(frozen=True)
class PaymentVerificationResult:
    payment: Payment
    outcome: str


@dataclass(frozen=True)
class PaymentRefundResult:
    refund: PaymentRefund
    outcome: str


_ALLOWED_TRANSITIONS = {
    Payment.Status.INITIALIZING: {
        Payment.Status.PENDING,
        Payment.Status.FAILED,
        Payment.Status.ABANDONED,
        Payment.Status.REFUND_REQUIRED,
        Payment.Status.RECONCILIATION_REQUIRED,
    },
    Payment.Status.PENDING: {
        Payment.Status.FAILED,
        Payment.Status.ABANDONED,
        Payment.Status.REFUND_REQUIRED,
        Payment.Status.RECONCILIATION_REQUIRED,
    },
    Payment.Status.SUCCEEDED: {
        Payment.Status.REFUND_PENDING,
        Payment.Status.REFUND_REQUIRED,
        Payment.Status.REFUNDED,
        Payment.Status.RECONCILIATION_REQUIRED,
    },
    Payment.Status.FAILED: {
        Payment.Status.PENDING,
        Payment.Status.REFUND_REQUIRED,
        Payment.Status.RECONCILIATION_REQUIRED,
    },
    Payment.Status.ABANDONED: {
        Payment.Status.PENDING,
        Payment.Status.REFUND_REQUIRED,
        Payment.Status.RECONCILIATION_REQUIRED,
    },
    Payment.Status.REFUND_REQUIRED: {
        Payment.Status.REFUND_PENDING,
        Payment.Status.REFUNDED,
        Payment.Status.RECONCILIATION_REQUIRED,
    },
    Payment.Status.REFUND_PENDING: {
        Payment.Status.REFUNDED,
        Payment.Status.RECONCILIATION_REQUIRED,
    },
    Payment.Status.REFUNDED: set(),
    Payment.Status.RECONCILIATION_REQUIRED: {
        Payment.Status.FAILED,
        Payment.Status.ABANDONED,
        Payment.Status.REFUND_REQUIRED,
        Payment.Status.REFUNDED,
    },
}

_FINAL_STATUSES = {
    Payment.Status.SUCCEEDED,
    Payment.Status.FAILED,
    Payment.Status.ABANDONED,
    Payment.Status.REFUND_REQUIRED,
    Payment.Status.REFUND_PENDING,
    Payment.Status.REFUNDED,
    Payment.Status.RECONCILIATION_REQUIRED,
}

_NON_RETRYABLE_ORDER_PAYMENT_STATUSES = {
    Payment.Status.SUCCEEDED,
    Payment.Status.REFUND_PENDING,
    Payment.Status.REFUND_REQUIRED,
    Payment.Status.REFUNDED,
    Payment.Status.RECONCILIATION_REQUIRED,
}


def create_payment_attempt(order_id, idempotency_key):
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order_id)
        if order.currency not in CURRENCY_MINOR_UNIT_MULTIPLIERS:
            raise UnsupportedPaymentCurrency(
                f"Payments in {order.currency} are not supported."
            )
        try:
            amount_minor = amount_to_minor_units(order.total, order.currency)
        except ValueError as exc:
            raise InvalidPaymentAmount(str(exc)) from exc

        existing = Payment.objects.filter(
            order=order,
            idempotency_key=idempotency_key,
        ).first()
        if existing is not None:
            if (
                existing.amount != order.total
                or existing.currency != order.currency
                or existing.amount_minor != amount_minor
            ):
                raise PaymentConflict(
                    "This idempotency key was already used for a different payment."
                )
            return existing, False

        if (
            order.status != Order.Status.PENDING
            or order.payment_status != Order.PaymentStatus.UNPAID
        ):
            raise PaymentConflict("This order is not eligible for payment.")

        if Payment.objects.filter(
            order=order,
            status__in=[Payment.Status.INITIALIZING, Payment.Status.PENDING],
        ).exists():
            raise PaymentConflict(
                "The order already has an active payment attempt."
            )
        if Payment.objects.filter(
            order=order,
            status__in=_NON_RETRYABLE_ORDER_PAYMENT_STATUSES,
        ).exists():
            raise PaymentConflict(
                "The order has a payment attempt that requires resolution."
            )

        payment = Payment.objects.create(
            order=order,
            amount=order.total,
            amount_minor=amount_minor,
            currency=order.currency,
            idempotency_key=idempotency_key,
        )
        return payment, True


def complete_payment_initialization(payment_id, authorization_url):
    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(pk=payment_id)
        if payment.status == Payment.Status.PENDING:
            if payment.authorization_url != authorization_url:
                raise PaymentInitializationConflict(
                    "The payment already has a different authorization URL."
                )
            return payment, False
        if payment.status != Payment.Status.INITIALIZING:
            if payment.status in _FINAL_STATUSES:
                return payment, False
            raise InvalidPaymentTransition(
                "Only initializing payments can receive an authorization URL."
            )

        payment.status = Payment.Status.PENDING
        payment.authorization_url = authorization_url
        payment.save(update_fields=["status", "authorization_url", "updated_at"])
        return payment, True


def _verification_digest(transaction_data):
    canonical = json.dumps(
        transaction_data,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _record_verification_event(payment, transaction_data, event_type):
    digest = _verification_digest(transaction_data)
    PaymentEvent.objects.get_or_create(
        provider=payment.provider,
        deduplication_key=f"verify:{payment.reference}:{digest}",
        defaults={
            "payment": payment,
            "event_identifier": "",
            "payload_digest": digest,
            "event_type": f"verification.{event_type}",
            "processing_status": PaymentEvent.ProcessingStatus.PROCESSED,
            "processed_at": timezone.now(),
        },
    )


def _set_payment_status(payment, status, *, transaction_id=""):
    now = timezone.now()
    payment.status = status
    update_fields = ["status", "updated_at"]
    if transaction_id and not payment.provider_transaction_id:
        payment.provider_transaction_id = transaction_id
        update_fields.append("provider_transaction_id")
    if status in _FINAL_STATUSES:
        payment.processed_at = now
        update_fields.append("processed_at")
    if status == Payment.Status.SUCCEEDED:
        payment.succeeded_at = now
        update_fields.append("succeeded_at")
    if status == Payment.Status.REFUNDED:
        payment.refunded_at = now
        update_fields.append("refunded_at")
    payment.save(update_fields=update_fields)


def create_payment_refund(payment_id, idempotency_key, initiated_by):
    with transaction.atomic():
        payment_order_id = Payment.objects.values_list(
            "order_id",
            flat=True,
        ).get(pk=payment_id)
        order = Order.objects.select_for_update().get(pk=payment_order_id)
        payment = Payment.objects.select_for_update().get(
            pk=payment_id,
            order_id=order.pk,
        )

        existing = PaymentRefund.objects.filter(payment=payment).first()
        if existing is not None:
            if existing.idempotency_key != idempotency_key:
                raise PaymentConflict(
                    "A refund attempt already exists for this payment."
                )
            return existing, False

        if payment.status not in {
            Payment.Status.SUCCEEDED,
            Payment.Status.REFUND_REQUIRED,
        }:
            raise PaymentConflict(
                "Only successfully charged or refund-required payments can be refunded."
            )
        try:
            expected_minor = amount_to_minor_units(order.total, order.currency)
        except ValueError as exc:
            raise InvalidPaymentAmount(str(exc)) from exc
        if (
            payment.amount != order.total
            or payment.currency != order.currency
            or payment.amount_minor != expected_minor
        ):
            raise PaymentConflict(
                "Payment and order totals do not match; reconciliation is required."
            )

        refund = PaymentRefund.objects.create(
            payment=payment,
            idempotency_key=idempotency_key,
            amount_minor=payment.amount_minor,
            currency=payment.currency,
            initiated_by=initiated_by,
        )
        payment.status = Payment.Status.REFUND_PENDING
        payment.save(update_fields=["status", "updated_at"])
        return refund, True


def complete_payment_refund_request(refund_id, provider_result):
    if (
        not isinstance(provider_result, dict)
        or set(provider_result) != {"id", "status"}
        or not isinstance(provider_result["id"], str)
        or not provider_result["id"]
        or len(provider_result["id"]) > 128
        or provider_result["status"] not in {"pending", "processing", "processed"}
    ):
        raise InvalidPaymentVerification("Refund response has an invalid structure.")

    with transaction.atomic():
        payment_id = PaymentRefund.objects.values_list(
            "payment_id",
            flat=True,
        ).get(pk=refund_id)
        payment_order_id = Payment.objects.values_list(
            "order_id",
            flat=True,
        ).get(pk=payment_id)
        order = Order.objects.select_for_update().get(pk=payment_order_id)
        payment = Payment.objects.select_for_update().get(
            pk=payment_id,
            order_id=order.pk,
        )
        refund = PaymentRefund.objects.select_for_update().get(
            pk=refund_id,
            payment_id=payment.pk,
        )

        if refund.provider_refund_id and (
            refund.provider_refund_id != provider_result["id"]
        ):
            raise PaymentConflict(
                "The refund attempt is already associated with another provider refund."
            )
        duplicate_refund = (
            PaymentRefund.objects.filter(
                provider_refund_id=provider_result["id"],
            )
            .exclude(pk=refund.pk)
            .exists()
        )
        if duplicate_refund:
            refund.status = PaymentRefund.Status.RECONCILIATION_REQUIRED
            refund.save(update_fields=["status", "updated_at"])
            return PaymentRefundResult(refund, "reconciliation_required")

        refund.provider_refund_id = provider_result["id"]
        refund.status = PaymentRefund.Status.PENDING
        refund.save(
            update_fields=[
                "provider_refund_id",
                "status",
                "updated_at",
            ]
        )
        return PaymentRefundResult(refund, "refund_pending")


def _sale_key(order_item):
    return uuid5(
        NAMESPACE_URL,
        f"whitestag:order:{order_item.order.public_reference}:sale:{order_item.pk}",
    )


def reconcile_verified_transaction(payment_id, transaction_data):
    required_keys = {"reference", "status", "amount", "currency", "transaction_id"}
    if (
        not isinstance(transaction_data, dict)
        or set(transaction_data) != required_keys
        or not isinstance(transaction_data["reference"], str)
        or not isinstance(transaction_data["status"], str)
        or isinstance(transaction_data["amount"], bool)
        or not isinstance(transaction_data["amount"], int)
        or not isinstance(transaction_data["currency"], str)
        or not isinstance(transaction_data["transaction_id"], str)
    ):
        raise InvalidPaymentVerification(
            "Payment verification data has an invalid structure."
        )

    outcome = transaction_data["status"]
    if outcome not in {
        "success",
        "failed",
        "abandoned",
        "pending",
        "ongoing",
        "processing",
    }:
        outcome = "inconclusive"

    with transaction.atomic():
        payment_order_id = Payment.objects.values_list(
            "order_id",
            flat=True,
        ).get(pk=payment_id)
        order = Order.objects.select_for_update().get(pk=payment_order_id)
        payment = Payment.objects.select_for_update().get(
            pk=payment_id,
            order_id=order.pk,
        )

        try:
            expected_order_minor = amount_to_minor_units(
                order.total,
                order.currency,
            )
        except ValueError:
            expected_order_minor = None

        mismatch = (
            transaction_data["reference"] != payment.reference
            or transaction_data["amount"] != payment.amount_minor
            or transaction_data["currency"] != payment.currency
            or payment.amount != order.total
            or payment.currency != order.currency
            or expected_order_minor != payment.amount_minor
            or (
                payment.provider_transaction_id
                and transaction_data["transaction_id"]
                and transaction_data["transaction_id"]
                != payment.provider_transaction_id
            )
        )
        provider_status = transaction_data["status"]

        duplicate_transaction = (
            Payment.objects.filter(
                provider=payment.provider,
                provider_transaction_id=transaction_data["transaction_id"],
            )
            .exclude(pk=payment.pk)
            .exists()
            if transaction_data["transaction_id"]
            else False
        )
        if duplicate_transaction:
            if payment.status not in {
                Payment.Status.SUCCEEDED,
                Payment.Status.REFUNDED,
            }:
                _set_payment_status(
                    payment,
                    Payment.Status.RECONCILIATION_REQUIRED,
                )
            _record_verification_event(
                payment,
                transaction_data,
                "duplicate_transaction",
            )
            return PaymentVerificationResult(
                payment,
                (
                    "refunded"
                    if payment.status == Payment.Status.REFUNDED
                    else "reconciliation_required"
                ),
            )

        if mismatch:
            if payment.status not in {
                Payment.Status.SUCCEEDED,
                Payment.Status.REFUNDED,
            }:
                _set_payment_status(
                    payment,
                    Payment.Status.RECONCILIATION_REQUIRED,
                    transaction_id=transaction_data["transaction_id"],
                )
            _record_verification_event(
                payment,
                transaction_data,
                (
                    "post_settlement_mismatch"
                    if payment.status
                    in {Payment.Status.SUCCEEDED, Payment.Status.REFUNDED}
                    else "mismatch"
                ),
            )
            return PaymentVerificationResult(
                payment,
                "refunded"
                if payment.status == Payment.Status.REFUNDED
                else "reconciliation_required",
            )

        if payment.status == Payment.Status.REFUND_REQUIRED:
            return PaymentVerificationResult(payment, "refund_required")
        if payment.status == Payment.Status.REFUND_PENDING:
            return PaymentVerificationResult(payment, "refund_pending")
        if payment.status == Payment.Status.REFUNDED:
            return PaymentVerificationResult(payment, "refunded")

        if payment.status == Payment.Status.SUCCEEDED:
            return PaymentVerificationResult(payment, "succeeded")

        if provider_status == "success":
            if (
                order.status != Order.Status.PENDING
                or order.payment_status not in {
                    Order.PaymentStatus.UNPAID,
                    Order.PaymentStatus.PENDING,
                }
            ):
                _set_payment_status(
                    payment,
                    Payment.Status.REFUND_REQUIRED,
                    transaction_id=transaction_data["transaction_id"],
                )
                _record_verification_event(
                    payment,
                    transaction_data,
                    "success_after_order_closed",
                )
                return PaymentVerificationResult(payment, "refund_required")

            try:
                with transaction.atomic():
                    order_items = list(
                        order.items.select_related("product").order_by(
                            "product_id",
                            "pk",
                        )
                    )
                    if not order_items:
                        raise StockOperationError("Order has no reservable items.")
                    for item in order_items:
                        record_sale(
                            item.product_id,
                            item.quantity,
                            idempotency_key=_sale_key(item),
                            reason="Payment verified",
                            reference=str(order.public_reference),
                        )
            except StockOperationError:
                _set_payment_status(
                    payment,
                    Payment.Status.REFUND_REQUIRED,
                    transaction_id=transaction_data["transaction_id"],
                )
                _record_verification_event(
                    payment,
                    transaction_data,
                    "reservation_unavailable",
                )
                return PaymentVerificationResult(payment, "refund_required")

            _set_payment_status(
                payment,
                Payment.Status.SUCCEEDED,
                transaction_id=transaction_data["transaction_id"],
            )
            order.payment_status = Order.PaymentStatus.PAID
            order.status = Order.Status.PROCESSING
            order.save(
                update_fields=["payment_status", "status", "updated_at"]
            )
            _record_verification_event(payment, transaction_data, "success")
            return PaymentVerificationResult(payment, "succeeded")

        if provider_status == "failed":
            _set_payment_status(
                payment,
                Payment.Status.FAILED,
                transaction_id=transaction_data["transaction_id"],
            )
            if order.payment_status == Order.PaymentStatus.PENDING:
                order.payment_status = Order.PaymentStatus.UNPAID
                order.save(update_fields=["payment_status", "updated_at"])
            _record_verification_event(payment, transaction_data, "failed")
            return PaymentVerificationResult(payment, "failed")

        if provider_status == "abandoned":
            _set_payment_status(
                payment,
                Payment.Status.ABANDONED,
                transaction_id=transaction_data["transaction_id"],
            )
            if order.payment_status == Order.PaymentStatus.PENDING:
                order.payment_status = Order.PaymentStatus.UNPAID
                order.save(update_fields=["payment_status", "updated_at"])
            _record_verification_event(payment, transaction_data, "abandoned")
            return PaymentVerificationResult(payment, "abandoned")

        if provider_status in {"pending", "ongoing", "processing"}:
            another_active_attempt = Payment.objects.filter(
                order_id=order.pk,
                status__in=[
                    Payment.Status.INITIALIZING,
                    Payment.Status.PENDING,
                ],
            ).exclude(pk=payment.pk).exists()
            if another_active_attempt:
                _set_payment_status(
                    payment,
                    Payment.Status.RECONCILIATION_REQUIRED,
                    transaction_id=transaction_data["transaction_id"],
                )
                _record_verification_event(
                    payment,
                    transaction_data,
                    "overlapping_pending_attempt",
                )
                return PaymentVerificationResult(
                    payment,
                    "reconciliation_required",
                )

            if payment.status in {
                Payment.Status.INITIALIZING,
                Payment.Status.FAILED,
                Payment.Status.ABANDONED,
                Payment.Status.RECONCILIATION_REQUIRED,
            }:
                payment.status = Payment.Status.PENDING
                payment.authorization_url = ""
                payment.provider_transaction_id = (
                    transaction_data["transaction_id"]
                    or payment.provider_transaction_id
                )
                payment.save(
                    update_fields=[
                        "status",
                        "authorization_url",
                        "provider_transaction_id",
                        "updated_at",
                    ]
                )
            if (
                order.status == Order.Status.PENDING
                and order.payment_status == Order.PaymentStatus.UNPAID
            ):
                order.payment_status = Order.PaymentStatus.PENDING
                order.save(update_fields=["payment_status", "updated_at"])
            _record_verification_event(payment, transaction_data, "pending")
            return PaymentVerificationResult(payment, "pending")

        _record_verification_event(payment, transaction_data, "inconclusive")
        return PaymentVerificationResult(payment, "inconclusive")


@dataclass(frozen=True)
class PaymentWebhookResult:
    event: PaymentEvent
    outcome: str


def process_paystack_webhook(event_type, provider_data, payload_digest):
    if (
        not isinstance(payload_digest, str)
        or len(payload_digest) != 64
        or any(character not in "0123456789abcdef" for character in payload_digest)
    ):
        raise InvalidPaymentVerification("Webhook digest is invalid.")

    reference = None
    if isinstance(provider_data, dict):
        reference = (
            provider_data.get("reference")
            or provider_data.get("transaction_reference")
        )
    if isinstance(reference, int) and not isinstance(reference, bool):
        reference = str(reference)
    payment = None
    if isinstance(reference, str) and len(reference) <= 128:
        payment = Payment.objects.filter(reference=reference).first()
        if payment is None:
            payment = Payment.objects.filter(
                provider_transaction_id=reference,
            ).first()
    expected_status = {
        "charge.success": "success",
        "charge.failed": "failed",
        "charge.abandoned": "abandoned",
        "charge.pending": "pending",
        "charge.ongoing": "ongoing",
        "charge.processing": "processing",
    }.get(event_type)
    deduplication_key = f"webhook:{payload_digest}"

    with transaction.atomic():
        event, created = PaymentEvent.objects.get_or_create(
            provider=Payment.Provider.PAYSTACK,
            deduplication_key=deduplication_key,
            defaults={
                "payment": payment,
                "payload_digest": payload_digest,
                "event_type": (
                    f"webhook.{event_type}"
                    if isinstance(event_type, str) and len(event_type) <= 80
                    else "webhook.ignored"
                ),
                "processing_status": PaymentEvent.ProcessingStatus.RECEIVED,
            },
        )
        if not created:
            return PaymentWebhookResult(event, "duplicate")

        def finish(outcome, processing_status, event_name=None):
            event.processing_status = processing_status
            if event_name is not None:
                event.event_type = event_name
            event.processed_at = timezone.now()
            event.save(
                update_fields=[
                    "processing_status",
                    "event_type",
                    "processed_at",
                ]
            )
            return PaymentWebhookResult(event, outcome)

        if event_type in {"refund.processed", "refund.failed"}:
            if payment is None or not isinstance(provider_data, dict):
                return finish(
                    "unknown_reference",
                    PaymentEvent.ProcessingStatus.IGNORED,
                    "webhook.unknown_reference",
                )
            try:
                result = reconcile_processed_refund(payment.pk, provider_data)
            except InvalidPaymentVerification:
                return finish(
                    "invalid_refund",
                    PaymentEvent.ProcessingStatus.FAILED,
                    "webhook.invalid_refund",
                )
            event.payment = result.payment
            event.save(update_fields=["payment"])
            processing_status = (
                PaymentEvent.ProcessingStatus.PROCESSED
                if result.outcome in {"refunded", "refund_pending"}
                else PaymentEvent.ProcessingStatus.FAILED
            )
            return finish(result.outcome, processing_status)

        if expected_status is None:
            return finish(
                "ignored",
                PaymentEvent.ProcessingStatus.IGNORED,
                "webhook.ignored",
            )
        if payment is None:
            return finish(
                "unknown_reference",
                PaymentEvent.ProcessingStatus.IGNORED,
                "webhook.unknown_reference",
            )
        if not isinstance(provider_data, dict):
            return finish(
                "invalid_payload",
                PaymentEvent.ProcessingStatus.FAILED,
                "webhook.invalid_payload",
            )

        provider_status = provider_data.get("status")
        amount = provider_data.get("amount")
        currency = provider_data.get("currency")
        transaction_id = provider_data.get("id")
        if (
            provider_data.get("reference") != payment.reference
            or provider_status != expected_status
            or isinstance(amount, bool)
            or not isinstance(amount, int)
            or amount < 0
            or not isinstance(currency, str)
            or len(currency) != 3
            or (
                transaction_id is not None
                and (
                    isinstance(transaction_id, bool)
                    or not isinstance(transaction_id, (int, str))
                    or len(str(transaction_id)) > 128
                )
            )
        ):
            return finish(
                "contradictory_or_invalid",
                PaymentEvent.ProcessingStatus.IGNORED,
                "webhook.contradictory_or_invalid",
            )

        transaction_data = {
            "reference": provider_data["reference"],
            "status": provider_status,
            "amount": amount,
            "currency": currency.upper(),
            "transaction_id": (
                str(transaction_id) if transaction_id is not None else ""
            ),
        }
        result = reconcile_verified_transaction(payment.pk, transaction_data)
        event.payment = result.payment
        event.save(update_fields=["payment"])

        if provider_status != "success" and result.outcome == "succeeded":
            return finish(
                "contradictory",
                PaymentEvent.ProcessingStatus.IGNORED,
                "webhook.contradictory",
            )
        return finish(
            result.outcome,
            PaymentEvent.ProcessingStatus.PROCESSED,
        )


def reconcile_processed_refund(payment_id, refund_data):
    required_keys = {
        "transaction_reference",
        "status",
        "amount",
        "currency",
    }
    if (
        not isinstance(refund_data, dict)
        or not required_keys.issubset(refund_data)
        or not isinstance(refund_data["transaction_reference"], str)
        or not isinstance(refund_data["status"], str)
        or isinstance(refund_data["amount"], bool)
        or not isinstance(refund_data["amount"], int)
        or not isinstance(refund_data["currency"], str)
    ):
        raise InvalidPaymentVerification("Refund data has an invalid structure.")

    with transaction.atomic():
        payment_order_id = Payment.objects.values_list(
            "order_id",
            flat=True,
        ).get(pk=payment_id)
        order = Order.objects.select_for_update().get(pk=payment_order_id)
        payment = Payment.objects.select_for_update().get(
            pk=payment_id,
            order_id=order.pk,
        )
        refund = (
            PaymentRefund.objects.select_for_update()
            .filter(payment=payment)
            .first()
        )

        references_match = refund_data["transaction_reference"] in {
            payment.reference,
            payment.provider_transaction_id,
        }
        provider_refund_id = refund_data.get("id")
        if provider_refund_id is not None and (
            isinstance(provider_refund_id, bool)
            or not isinstance(provider_refund_id, (int, str))
            or len(str(provider_refund_id)) > 128
        ):
            raise InvalidPaymentVerification("Refund identifier is invalid.")
        if provider_refund_id is not None and PaymentRefund.objects.filter(
            provider_refund_id=str(provider_refund_id),
        ).exclude(payment=payment).exists():
            if payment.status != Payment.Status.REFUNDED:
                _set_payment_status(
                    payment,
                    Payment.Status.RECONCILIATION_REQUIRED,
                )
            if refund is not None:
                refund.status = PaymentRefund.Status.RECONCILIATION_REQUIRED
                refund.save(update_fields=["status", "updated_at"])
            return PaymentVerificationResult(payment, "reconciliation_required")
        if (
            refund is not None
            and provider_refund_id is not None
            and refund.provider_refund_id
            and refund.provider_refund_id != str(provider_refund_id)
        ):
            payment.status = Payment.Status.RECONCILIATION_REQUIRED
            payment.save(update_fields=["status", "updated_at"])
            refund.status = PaymentRefund.Status.RECONCILIATION_REQUIRED
            refund.save(update_fields=["status", "updated_at"])
            return PaymentVerificationResult(payment, "reconciliation_required")
        try:
            expected_order_minor = amount_to_minor_units(
                order.total,
                order.currency,
            )
        except ValueError:
            expected_order_minor = None
        if (
            not references_match
            or refund_data["amount"] != payment.amount_minor
            or refund_data["currency"].upper() != payment.currency
            or payment.amount != order.total
            or payment.currency != order.currency
            or expected_order_minor != payment.amount_minor
        ):
            if payment.status != Payment.Status.REFUNDED:
                _set_payment_status(
                    payment,
                    Payment.Status.RECONCILIATION_REQUIRED,
                )
            if refund is not None:
                refund.status = PaymentRefund.Status.RECONCILIATION_REQUIRED
                refund.save(update_fields=["status", "updated_at"])
            return PaymentVerificationResult(payment, "reconciliation_required")

        refund_status = refund_data["status"].lower()
        if refund_status in {"pending", "processing"}:
            if payment.status == Payment.Status.REFUNDED:
                return PaymentVerificationResult(
                    payment,
                    "reconciliation_required",
                )
            if payment.status in {
                Payment.Status.SUCCEEDED,
                Payment.Status.REFUND_REQUIRED,
                Payment.Status.RECONCILIATION_REQUIRED,
            }:
                _set_payment_status(
                    payment,
                    Payment.Status.REFUND_PENDING,
                )
            if refund is not None:
                refund.status = PaymentRefund.Status.PENDING
                update_fields = ["status", "updated_at"]
                if provider_refund_id is not None:
                    refund.provider_refund_id = str(provider_refund_id)
                    update_fields.append("provider_refund_id")
                refund.save(update_fields=update_fields)
            return PaymentVerificationResult(payment, "refund_pending")
        if refund_status != "processed":
            if payment.status != Payment.Status.REFUNDED:
                _set_payment_status(
                    payment,
                    Payment.Status.RECONCILIATION_REQUIRED,
                )
            if refund is not None:
                refund.status = PaymentRefund.Status.RECONCILIATION_REQUIRED
                refund.save(update_fields=["status", "updated_at"])
            return PaymentVerificationResult(payment, "reconciliation_required")
        if payment.status == Payment.Status.REFUNDED:
            return PaymentVerificationResult(payment, "refunded")
        if payment.status not in {
            Payment.Status.SUCCEEDED,
            Payment.Status.REFUND_PENDING,
            Payment.Status.REFUND_REQUIRED,
            Payment.Status.RECONCILIATION_REQUIRED,
        }:
            _set_payment_status(
                payment,
                Payment.Status.RECONCILIATION_REQUIRED,
            )
            return PaymentVerificationResult(payment, "reconciliation_required")

        _set_payment_status(payment, Payment.Status.REFUNDED)
        order.payment_status = Order.PaymentStatus.REFUNDED
        order.save(update_fields=["payment_status", "updated_at"])
        if refund is not None:
            refund.status = PaymentRefund.Status.PROCESSED
            refund.processed_at = timezone.now()
            update_fields = ["status", "processed_at", "updated_at"]
            if provider_refund_id is not None:
                refund.provider_refund_id = str(provider_refund_id)
                update_fields.append("provider_refund_id")
            refund.save(update_fields=update_fields)
        return PaymentVerificationResult(payment, "refunded")


def transition_payment_status(
    payment_id,
    target_status,
    *,
    provider_transaction_id=None,
):
    if target_status in {
        Payment.Status.SUCCEEDED,
        Payment.Status.REFUND_PENDING,
        Payment.Status.REFUNDED,
    }:
        raise InvalidPaymentTransition(
            "Provider-confirmed payment states must be recorded through "
            "transaction reconciliation."
        )
    if target_status not in Payment.Status.values:
        raise InvalidPaymentTransition("Unknown payment status.")

    with transaction.atomic():
        payment = Payment.objects.select_for_update().get(pk=payment_id)
        if payment.status == target_status:
            if (
                provider_transaction_id
                and payment.provider_transaction_id
                and payment.provider_transaction_id != provider_transaction_id
            ):
                raise PaymentConflict(
                    "The payment is already associated with another provider "
                    "transaction."
                )
            if provider_transaction_id and not payment.provider_transaction_id:
                payment.provider_transaction_id = provider_transaction_id
                payment.save(update_fields=["provider_transaction_id", "updated_at"])
                return payment, True
            return payment, False

        if target_status not in _ALLOWED_TRANSITIONS[payment.status]:
            raise InvalidPaymentTransition(
                f"Payment cannot transition from {payment.status} to {target_status}."
            )

        if (
            provider_transaction_id
            and payment.provider_transaction_id
            and payment.provider_transaction_id != provider_transaction_id
        ):
            raise PaymentConflict(
                "The payment is already associated with another provider transaction."
            )

        payment.status = target_status
        update_fields = ["status", "updated_at"]
        if provider_transaction_id and not payment.provider_transaction_id:
            payment.provider_transaction_id = provider_transaction_id
            update_fields.append("provider_transaction_id")
        if target_status in _FINAL_STATUSES:
            payment.processed_at = timezone.now()
            update_fields.append("processed_at")
        if target_status == Payment.Status.SUCCEEDED:
            payment.succeeded_at = payment.processed_at
            update_fields.append("succeeded_at")
        payment.save(update_fields=update_fields)
        return payment, True
