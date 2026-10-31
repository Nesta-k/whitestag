from uuid import uuid4

from django.contrib.auth import authenticate, get_user_model, logout
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.authentication import BaseAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    NotFound,
    PermissionDenied,
    ValidationError,
)
from rest_framework.generics import (
    GenericAPIView,
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateAPIView,
)
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.catalogue.models import Product, ProductImage
from apps.catalogue.pagination import CataloguePagination

from .models import Cart, CustomerAccount, UserProfile, WishlistItem, get_user_role
from .google_accounts import get_or_create_google_customer
from .google_auth import GoogleIdentityError, verify_google_id_token
from .permissions import HasCustomerAccount, IsAdminOrSuperadmin, IsStaffOrAbove, IsSuperuser
from .serializers import (
    CartItemCreateSerializer,
    CartItemSerializer,
    CartItemUpdateSerializer,
    CartSerializer,
    CustomerSerializer,
    GoogleLoginSerializer,
    LoginSerializer,
    RegistrationSerializer,
    StaffCustomerSerializer,
    StaffIdentitySerializer,
    StaffLoginSerializer,
    SuperuserAccountSerializer,
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


class StaffLoginView(GenericAPIView):
    permission_classes = [AllowAny]
    authentication_classes = [NoAuthentication]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "customer_login"
    serializer_class = StaffLoginSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier = serializer.validated_data["email"]
        User = get_user_model()
        user_records = list(
            User.objects.filter(
                Q(email__iexact=identifier) | Q(username__iexact=identifier)
            )[:2]
        )
        if len(user_records) != 1:
            raise AuthenticationFailed("Invalid staff email or password.")
        user_record = user_records[0]
        user = authenticate(
            request,
            username=user_record.get_username(),
            password=serializer.validated_data["password"],
        )
        if user is None or not user.is_active or not user.is_staff:
            raise AuthenticationFailed("Invalid staff email or password.")

        token, _ = Token.objects.get_or_create(user=user)
        role = get_user_role(user)
        return Response(
            {
                "token": token.key,
                "staff": StaffIdentitySerializer(
                    {
                        "id": user.pk,
                        "email": user.email,
                        "first_name": user.first_name,
                        "last_name": user.last_name,
                        "role": role,
                        "date_joined": user.date_joined,
                        "is_superuser": user.is_superuser,
                    }
                ).data,
            }
        )


class StaffMeView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        user = request.user
        role = get_user_role(user)
        return Response(
            StaffIdentitySerializer(
                {
                    "id": user.pk,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "role": role,
                    "date_joined": user.date_joined,
                    "is_superuser": user.is_superuser,
                }
            ).data
        )


class StaffCustomerListView(ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = StaffCustomerSerializer
    pagination_class = CataloguePagination

    def get_queryset(self):
        queryset = CustomerAccount.objects.order_by("-created_at", "-pk")
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(email__icontains=search)
        return queryset


class SuperuserAccountListCreateView(ListCreateAPIView):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserAccountSerializer
    pagination_class = CataloguePagination

    def get_queryset(self):
        queryset = get_user_model().objects.order_by("-date_joined", "-pk")
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
        role = self.request.query_params.get("role")
        if role in (
            SuperuserAccountSerializer.Role.SUPERUSER,
            SuperuserAccountSerializer.Role.SUPERADMIN,
        ):
            queryset = queryset.filter(
                Q(is_superuser=True)
                | Q(profile__role=UserProfile.Role.SUPERADMIN)
            )
        elif role == SuperuserAccountSerializer.Role.ADMIN:
            queryset = queryset.filter(
                is_staff=True,
                is_superuser=False,
                profile__role=UserProfile.Role.ADMIN,
            )
        elif role == SuperuserAccountSerializer.Role.STAFF:
            queryset = queryset.filter(
                is_staff=True,
                is_superuser=False,
            ).exclude(profile__role=UserProfile.Role.ADMIN)
        elif role == SuperuserAccountSerializer.Role.CUSTOMER:
            queryset = queryset.filter(is_staff=False, is_superuser=False)
        return queryset

    def perform_create(self, serializer):
        request_role = get_user_role(self.request.user)
        target_role = serializer.validated_data.get(
            "role", SuperuserAccountSerializer.Role.CUSTOMER
        )
        if target_role == SuperuserAccountSerializer.Role.SUPERUSER:
            target_role = SuperuserAccountSerializer.Role.SUPERADMIN

        if request_role == UserProfile.Role.ADMIN:
            if target_role not in (
                SuperuserAccountSerializer.Role.STAFF,
                SuperuserAccountSerializer.Role.CUSTOMER,
            ):
                raise PermissionDenied(
                    "Admin (Owner) can only create Staff and Customer accounts."
                )

        try:
            serializer.save()
        except IntegrityError as exc:
            raise ValidationError(
                {"detail": "The username or email address is already in use."}
            ) from exc


class SuperuserAccountDetailView(RetrieveUpdateAPIView):
    permission_classes = [IsAdminOrSuperadmin]
    serializer_class = SuperuserAccountSerializer
    queryset = get_user_model().objects.all()

    def perform_update(self, serializer):
        target_user = serializer.instance
        target_role = get_user_role(target_user)
        caller_role = get_user_role(self.request.user)

        if caller_role == UserProfile.Role.ADMIN:
            if target_role == UserProfile.Role.SUPERADMIN:
                raise PermissionDenied(
                    "Admin (Owner) cannot edit or deactivate the Superadmin (Developer) account."
                )
            if target_role == UserProfile.Role.ADMIN and target_user.pk != self.request.user.pk:
                raise PermissionDenied(
                    "Admin (Owner) cannot edit other Admin accounts."
                )
            new_role = serializer.validated_data.get("role")
            if new_role in (
                SuperuserAccountSerializer.Role.SUPERADMIN,
                SuperuserAccountSerializer.Role.SUPERUSER,
                SuperuserAccountSerializer.Role.ADMIN,
            ):
                raise PermissionDenied(
                    "Admin (Owner) cannot promote accounts to Admin or Superadmin."
                )

        new_role = serializer.validated_data.get("role")
        new_active = serializer.validated_data.get("is_active", target_user.is_active)
        remains_superuser = (
            target_user.is_superuser
            if new_role is None
            else new_role in (
                SuperuserAccountSerializer.Role.SUPERUSER,
                SuperuserAccountSerializer.Role.SUPERADMIN,
            )
        )
        if target_user.pk == self.request.user.pk and (
            not new_active or not remains_superuser
        ):
            raise ValidationError(
                {"detail": "You cannot deactivate or demote your own superuser account."}
            )
        if target_user.is_superuser and (not remains_superuser or not new_active):
            another_active_superuser = (
                get_user_model()
                .objects.filter(is_superuser=True, is_active=True)
                .exclude(pk=target_user.pk)
                .exists()
            )
            if not another_active_superuser:
                raise ValidationError(
                    {"detail": "At least one active superuser account must remain."}
                )
        serializer.save()


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
            .prefetch_related(
                "items__product__inventory",
                Prefetch(
                    "items__product__images",
                    queryset=ProductImage.objects.order_by(
                        "-is_primary",
                        "display_order",
                        "pk",
                    ),
                ),
            ),
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
