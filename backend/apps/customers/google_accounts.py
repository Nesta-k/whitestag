from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from rest_framework.exceptions import AuthenticationFailed

from .models import Cart, CustomerAccount


def _verified_email(claims):
    email = claims["email"].strip().lower()
    if len(email) > 254:
        raise AuthenticationFailed("Google returned an invalid email address.")
    try:
        validate_email(email)
    except DjangoValidationError as exc:
        raise AuthenticationFailed("Google returned an invalid email address.") from exc
    return email


def _customer_for_verified_claims(claims, email):
    account = (
        CustomerAccount.objects.select_for_update()
        .select_related("user")
        .filter(google_sub=claims["sub"])
        .first()
    )
    if account is None:
        account = (
            CustomerAccount.objects.select_for_update()
            .select_related("user")
            .filter(email__iexact=email)
            .first()
        )

    if account is not None:
        user = account.user
        if not user.is_active or user.is_staff or user.is_superuser:
            raise AuthenticationFailed("This account cannot use customer sign-in.")
        if account.google_sub and account.google_sub != claims["sub"]:
            raise AuthenticationFailed(
                "This customer account is linked to a different Google account."
            )
        if not account.google_sub:
            account.google_sub = claims["sub"]
            account.save(update_fields=["google_sub"])
        Cart.objects.get_or_create(customer=account)
        return account

    User = get_user_model()
    user = User(
        username=uuid4().hex,
        email=email,
        first_name=str(claims.get("given_name", ""))[:150],
        last_name=str(claims.get("family_name", ""))[:150],
        is_staff=False,
        is_superuser=False,
    )
    user.set_unusable_password()
    user.save(force_insert=True)
    account = CustomerAccount.objects.create(
        user=user,
        email=email,
        google_sub=claims["sub"],
    )
    Cart.objects.create(customer=account)
    return account


def get_or_create_google_customer(claims):
    email = _verified_email(claims)
    try:
        with transaction.atomic():
            return _customer_for_verified_claims(claims, email)
    except IntegrityError as exc:
        # A concurrent first sign-in may win the unique email or Google subject.
        try:
            with transaction.atomic():
                account = (
                    CustomerAccount.objects.select_for_update()
                    .select_related("user")
                    .filter(google_sub=claims["sub"])
                    .first()
                )
                if account is None:
                    account = (
                        CustomerAccount.objects.select_for_update()
                        .select_related("user")
                        .filter(email__iexact=email)
                        .first()
                    )
                if account is None:
                    raise AuthenticationFailed(
                        "Google sign-in could not create your account."
                    ) from exc
                user = account.user
                if not user.is_active or user.is_staff or user.is_superuser:
                    raise AuthenticationFailed(
                        "This account cannot use customer sign-in."
                    )
                if account.google_sub and account.google_sub != claims["sub"]:
                    raise AuthenticationFailed(
                        "This customer account is linked to a different Google account."
                    )
                if not account.google_sub:
                    account.google_sub = claims["sub"]
                    account.save(update_fields=["google_sub"])
                Cart.objects.get_or_create(customer=account)
                return account
        except IntegrityError as retry_error:
            raise AuthenticationFailed(
                "Google sign-in could not create your account."
            ) from retry_error
