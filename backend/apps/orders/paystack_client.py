import hashlib
import hmac
import json
import re
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.conf import settings


PAYSTACK_API_BASE_URL = "https://api.paystack.co"
PAYSTACK_INITIALIZE_URL = f"{PAYSTACK_API_BASE_URL}/transaction/initialize"
REQUEST_TIMEOUT_SECONDS = 10
MAX_RESPONSE_BYTES = 65536


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


class PaystackInitializationError(Exception):
    pass


class PaystackVerificationError(Exception):
    pass


class PaystackRefundError(Exception):
    pass


class PaystackWebhookSignatureError(Exception):
    pass


def verify_webhook_signature(payload, signature):
    secret_key = settings.PAYSTACK_SECRET_KEY
    if not secret_key:
        raise PaystackWebhookSignatureError(
            "Paystack webhook verification is not configured."
        )
    if (
        not isinstance(signature, str)
        or re.fullmatch(r"[0-9a-fA-F]{128}", signature) is None
    ):
        return False

    expected_signature = hmac.new(
        secret_key.encode("utf-8"),
        payload,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(expected_signature, signature.lower())


def _request_paystack_json(request):
    try:
        opener = build_opener(_NoRedirectHandler)
        with opener.open(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            response_body = response.read(MAX_RESPONSE_BYTES + 1)
    except (HTTPError, HTTPException, URLError, TimeoutError, OSError) as exc:
        raise PaystackInitializationError(
            "Paystack request could not be confirmed."
        ) from exc
    if len(response_body) > MAX_RESPONSE_BYTES:
        raise PaystackInitializationError(
            "Paystack returned an oversized response."
        )

    try:
        result = json.loads(response_body)
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError) as exc:
        raise PaystackInitializationError(
            "Paystack returned an invalid response."
        ) from exc
    if not isinstance(result, dict) or result.get("status") is not True:
        raise PaystackInitializationError(
            "Paystack did not accept the request."
        )
    return result


def initialize_transaction(payment, customer_email):
    secret_key = settings.PAYSTACK_SECRET_KEY
    if not secret_key:
        raise PaystackInitializationError(
            "Paystack is not configured for payment initialization."
        )

    payload = {
        "email": customer_email,
        "amount": payment.amount_minor,
        "currency": payment.currency,
        "reference": payment.reference,
    }
    request = Request(
        PAYSTACK_INITIALIZE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        result = _request_paystack_json(request)
    except PaystackInitializationError as exc:
        raise PaystackInitializationError(
            "Paystack transaction initialization could not be confirmed."
        ) from exc

    data = result.get("data")
    if not isinstance(data, dict):
        raise PaystackInitializationError(
            "Paystack returned an invalid initialization response."
        )

    authorization_url = data.get("authorization_url")
    reference = data.get("reference")
    if not isinstance(authorization_url, str) or reference != payment.reference:
        raise PaystackInitializationError(
            "Paystack returned an invalid initialization response."
        )
    if len(authorization_url) > 2048:
        raise PaystackInitializationError(
            "Paystack returned an invalid authorization URL."
        )
    try:
        parsed_url = urlparse(authorization_url)
        hostname = parsed_url.hostname
    except ValueError as exc:
        raise PaystackInitializationError(
            "Paystack returned an invalid authorization URL."
        ) from exc
    if (
        parsed_url.scheme != "https"
        or hostname != "checkout.paystack.com"
        or parsed_url.username is not None
        or parsed_url.password is not None
    ):
        raise PaystackInitializationError(
            "Paystack returned an invalid authorization URL."
        )

    return authorization_url


def verify_transaction(payment):
    secret_key = settings.PAYSTACK_SECRET_KEY
    if not secret_key:
        raise PaystackVerificationError(
            "Paystack is not configured for payment verification."
        )

    encoded_reference = quote(payment.reference, safe="")
    request = Request(
        f"{PAYSTACK_API_BASE_URL}/transaction/verify/{encoded_reference}",
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        result = _request_paystack_json(request)
    except PaystackInitializationError as exc:
        raise PaystackVerificationError(
            "Paystack transaction verification could not be confirmed."
        ) from exc

    data = result.get("data")
    if not isinstance(data, dict):
        raise PaystackVerificationError(
            "Paystack returned an invalid verification response."
        )
    reference = data.get("reference")
    provider_status = data.get("status")
    amount = data.get("amount")
    currency = data.get("currency")
    transaction_id = data.get("id")
    if (
        not isinstance(reference, str)
        or len(reference) > 64
        or not isinstance(provider_status, str)
        or not provider_status
        or len(provider_status) > 32
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
        raise PaystackVerificationError(
            "Paystack returned an invalid verification response."
        )

    return {
        "reference": reference,
        "status": provider_status.lower(),
        "amount": amount,
        "currency": currency.upper(),
        "transaction_id": str(transaction_id) if transaction_id is not None else "",
    }


def initiate_refund(payment):
    secret_key = settings.PAYSTACK_SECRET_KEY
    if not secret_key:
        raise PaystackRefundError(
            "Paystack is not configured for refunds."
        )

    transaction_reference = (
        payment.provider_transaction_id or payment.reference
    )
    request = Request(
        f"{PAYSTACK_API_BASE_URL}/refund",
        data=json.dumps(
            {
                "transaction": transaction_reference,
                "amount": payment.amount_minor,
                "currency": payment.currency,
            }
        ).encode("utf-8"),
        headers={
            "Authorization": f"******",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        result = _request_paystack_json(request)
    except PaystackInitializationError as exc:
        raise PaystackRefundError(
            "Paystack refund initiation could not be confirmed."
        ) from exc

    data = result.get("data")
    if not isinstance(data, dict):
        raise PaystackRefundError(
            "Paystack returned an invalid refund response."
        )
    refund_id = data.get("id")
    refund_status = data.get("status")
    if (
        isinstance(refund_id, bool)
        or not isinstance(refund_id, (int, str))
        or len(str(refund_id)) > 128
        or not isinstance(refund_status, str)
        or refund_status.lower() not in {"pending", "processing", "processed"}
    ):
        raise PaystackRefundError(
            "Paystack returned an invalid refund response."
        )

    return {
        "id": str(refund_id),
        "status": refund_status.lower(),
    }
