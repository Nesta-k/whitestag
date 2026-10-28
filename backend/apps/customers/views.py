from uuid import uuid4

from django.contrib.auth import authenticate, get_user_model, logout
from django.conf import settings
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.authentication import BaseAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    NotFound,
    ValidationError,
)
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.catalogue.models import Product
from apps.catalogue.pagination import CataloguePagination

from .models import Cart, CustomerAccount, WishlistItem
from .google_accounts import get_or_create_google_customer
from .google_auth import GoogleIdentityError, verify_google_id_token
from .permissions import HasCustomerAccount
from .serializers import (
    CartItemCreateSerializer,
    CartItemSerializer,
    CartItemUpdateSerializer,
    CartSerializer,
    CustomerSerializer,
    GoogleLoginSerializer,
    LoginSerializer,
    RegistrationSerializer,
    WishlistItemCreateSerializer,
    WishlistItemSerializer,
)
from .services import (
    ProductNotPurchasable,
    ProductUnavailable,
    add_cart_item,
    remove_cart_item,
    update_cart_item_quantity,
)


class CartConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "cart_conflict"


class NoAuthentication(BaseAuthentication):
    def authenticate(self, request):
        return None

    def authenticate_header(self, request):
        return "Token"


def _authentication_response(account, token):
    return {
        "token": token.key,
        "customer": CustomerSerializer(account).data,
    }


class RegistrationView(GenericAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "customer_register"
    serializer_class = RegistrationSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        try:
            with transaction.atomic():
                user = get_user_model().objects.create_user(
                    username=uuid4().hex,
                    email=email,
                    password=serializer.validated_data["password"],
                )
                account = CustomerAccount.objects.create(user=user, email=email)
                Cart.objects.create(customer=account)
                token = Token.objects.create(user=user)
        except IntegrityError as exc:
            if CustomerAccount.objects.filter(email__iexact=email).exists():
                raise ValidationError(
                    {"email": "An account with this email address already exists."}
                ) from exc
            raise

        return Response(
            _authentication_response(account, token),
            status=status.HTTP_201_CREATED,
        )


class LoginView(GenericAPIView):
    permission_classes = [AllowAny]
    authentication_classes = [NoAuthentication]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "customer_login"
    serializer_class = LoginSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        try:
            account = CustomerAccount.objects.select_related("user").get(
                email__iexact=email
            )
        except CustomerAccount.DoesNotExist:
            raise AuthenticationFailed("Invalid email or password.")

        user = authenticate(
            request,
            username=account.user.username,
            password=serializer.validated_data["password"],
        )
        if user is None:
            raise AuthenticationFailed("Invalid email or password.")

        token, _ = Token.objects.get_or_create(user=user)
        return Response(_authentication_response(account, token))


class GoogleLoginUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "google_login_unavailable"
    default_detail = "Google sign-in is not configured."


class GoogleLoginView(GenericAPIView):
    permission_classes = [AllowAny]
    authentication_classes = [NoAuthentication]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "customer_google_login"
    serializer_class = GoogleLoginSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client_id = getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "")
        if not client_id:
            raise GoogleLoginUnavailable()

        try:
            claims = verify_google_id_token(
                serializer.validated_data["credential"],
                client_id,
            )
        except GoogleIdentityError as exc:
            raise AuthenticationFailed(str(exc)) from exc

        account = get_or_create_google_customer(claims)
        token, _ = Token.objects.get_or_create(user=account.user)
        return Response(_authentication_response(account, token))


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if isinstance(request.auth, Token):
            request.auth.delete()
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentCustomerView(APIView):
    permission_classes = [IsAuthenticated, HasCustomerAccount]

    def get(self, request):
        return Response(CustomerSerializer(request.user.customer_account).data)


class CartView(APIView):
    permission_classes = [IsAuthenticated, HasCustomerAccount]

    def get(self, request):
        cart = get_object_or_404(
            Cart.objects.filter(customer=request.user.customer_account)
            .prefetch_related("items__product__inventory"),
        )
        return Response(CartSerializer(cart).data)


class CartItemCreateView(APIView):
    permission_classes = [IsAuthenticated, HasCustomerAccount]

    def post(self, request):
        serializer = CartItemCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            item = add_cart_item(
                request.user.customer_account.pk,
                serializer.validated_data["product_id"],
                serializer.validated_data["quantity"],
            )
        except ProductNotPurchasable as exc:
            raise ValidationError({"product_id": str(exc)}) from exc
        except ProductUnavailable as exc:
            raise CartConflict({"quantity": str(exc)}) from exc
        except ValueError as exc:
            raise ValidationError({"quantity": str(exc)}) from exc
        return Response(CartItemSerializer(item).data, status=status.HTTP_201_CREATED)


class CartItemDetailView(APIView):
    permission_classes = [IsAuthenticated, HasCustomerAccount]

    def patch(self, request, item_id):
        serializer = CartItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            item = update_cart_item_quantity(
                request.user.customer_account.pk,
                item_id,
                serializer.validated_data["quantity"],
            )
        except ProductNotPurchasable as exc:
            raise ValidationError({"product_id": str(exc)}) from exc
        except ProductUnavailable as exc:
            raise CartConflict({"quantity": str(exc)}) from exc
        except ValueError as exc:
            raise ValidationError({"quantity": str(exc)}) from exc
        if item is None:
            raise NotFound("Cart item not found.")
        return Response(CartItemSerializer(item).data)

    def delete(self, request, item_id):
        removed = remove_cart_item(request.user.customer_account.pk, item_id)
        if not removed:
            raise NotFound("Cart item not found.")
        return Response(status=status.HTTP_204_NO_CONTENT)


class WishlistView(APIView):
    permission_classes = [IsAuthenticated, HasCustomerAccount]

    def get(self, request):
        items = (
            WishlistItem.objects.filter(
                customer_id=request.user.customer_account.pk,
                product__publication_status=Product.PublicationStatus.PUBLISHED,
            )
            .select_related("product__category", "product__brand")
            .prefetch_related("product__images", "product__specifications")
        )
        paginator = CataloguePagination()
        page = paginator.paginate_queryset(items, request, view=self)
        return paginator.get_paginated_response(
            WishlistItemSerializer(page, many=True).data
        )

    def post(self, request):
        serializer = WishlistItemCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        requested_product = serializer.validated_data["product"]

        with transaction.atomic():
            product = (
                Product.objects.select_for_update()
                .filter(
                    pk=requested_product.pk,
                    publication_status=Product.PublicationStatus.PUBLISHED,
                )
                .first()
            )
            if product is None:
                raise ValidationError(
                    {
                        "product_id": (
                            "A published catalogue product with this ID was not found."
                        )
                    }
                )
            item, created = WishlistItem.objects.get_or_create(
                customer_id=request.user.customer_account.pk,
                product=product,
            )

        return Response(
            WishlistItemSerializer(item).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class WishlistItemDetailView(APIView):
    permission_classes = [IsAuthenticated, HasCustomerAccount]

    def delete(self, request, item_id):
        item = get_object_or_404(
            WishlistItem,
            pk=item_id,
            customer_id=request.user.customer_account.pk,
        )
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
