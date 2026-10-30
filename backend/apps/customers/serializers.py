from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from apps.catalogue.models import Product
from apps.catalogue.serializers import ProductSerializer
from apps.inventory.models import InventoryRecord

from .models import (
    Cart,
    CartItem,
    CustomerAccount,
    UserProfile,
    WishlistItem,
    get_user_role,
)


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerAccount
        fields = ["id", "email", "created_at"]
        read_only_fields = fields


class RegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )
    password_confirm = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    def validate_email(self, value):
        normalized_email = value.strip().lower()
        if CustomerAccount.objects.filter(email__iexact=normalized_email).exists():
            raise serializers.ValidationError(
                "An account with this email address already exists."
            )
        return normalized_email

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )

        user = get_user_model()(email=attrs["email"])
        try:
            password_validation.validate_password(attrs["password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages}) from exc
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    def validate_email(self, value):
        return value.strip().lower()


class GoogleLoginSerializer(serializers.Serializer):
    credential = serializers.CharField(
        write_only=True,
        trim_whitespace=True,
        max_length=8192,
    )


class StaffLoginSerializer(serializers.Serializer):
    email = serializers.CharField(max_length=254, trim_whitespace=True)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_email(self, value):
        return value.strip()


class StaffIdentitySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    email = serializers.EmailField(allow_blank=True)
    first_name = serializers.CharField(allow_blank=True)
    last_name = serializers.CharField(allow_blank=True)
    role = serializers.CharField()
    date_joined = serializers.DateTimeField()
    is_superuser = serializers.BooleanField()


class SuperuserAccountSerializer(serializers.Serializer):
    class Role:
        CUSTOMER = "customer"
        STAFF = "staff"
        ADMIN = "admin"
        SUPERADMIN = "superadmin"
        SUPERUSER = "superuser"  # alias for backward compatibility

        choices = (
            (CUSTOMER, "Customer"),
            (STAFF, "Staff"),
            (ADMIN, "Admin (Owner)"),
            (SUPERADMIN, "Superadmin (Developer)"),
            (SUPERUSER, "Superuser (Developer)"),
        )

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(max_length=254, allow_blank=True)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(
        choices=Role.choices,
        required=False,
        write_only=True,
    )
    is_active = serializers.BooleanField(required=False)
    password = serializers.CharField(
        write_only=True,
        required=False,
        trim_whitespace=False,
        min_length=1,
        style={"input_type": "password"},
    )
    date_joined = serializers.DateTimeField(read_only=True)

    def validate_username(self, value):
        value = value.strip()
        User = get_user_model()
        users = User.objects.filter(username__iexact=value)
        if self.instance:
            users = users.exclude(pk=self.instance.pk)
        if users.exists():
            raise serializers.ValidationError("This username is already in use.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if not value:
            if self.instance is not None:
                return value
            raise serializers.ValidationError("An email address is required.")
        User = get_user_model()
        users = User.objects.filter(email__iexact=value)
        accounts = CustomerAccount.objects.filter(email__iexact=value)
        if self.instance:
            users = users.exclude(pk=self.instance.pk)
            if hasattr(self.instance, "customer_account"):
                accounts = accounts.exclude(pk=self.instance.customer_account.pk)
        if users.exists() or accounts.exists():
            raise serializers.ValidationError("This email address is already in use.")
        return value

    def validate(self, attrs):
        password = attrs.get("password")
        if self.instance is None and not attrs.get("email"):
            raise serializers.ValidationError({"email": "An email address is required."})
        if self.instance is None and not password:
            raise serializers.ValidationError({"password": "A password is required."})
        if password:
            user = get_user_model()(
                username=attrs.get("username", getattr(self.instance, "username", "")),
                email=attrs.get("email", getattr(self.instance, "email", "")),
            )
            try:
                password_validation.validate_password(password, user=user)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"password": exc.messages}) from exc
        if self.instance is not None and not attrs.get("email"):
            attrs["email"] = self.instance.email
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        User = get_user_model()
        role = validated_data.pop("role", self.Role.CUSTOMER)
        if role == self.Role.SUPERUSER:
            role = self.Role.SUPERADMIN
        password = validated_data.pop("password")
        is_active = validated_data.pop("is_active", True)
        user_fields = {
            key: validated_data[key]
            for key in ("username", "email", "first_name", "last_name")
            if key in validated_data
        }
        if role == self.Role.SUPERADMIN:
            user = User.objects.create_superuser(password=password, **user_fields)
        else:
            user = User.objects.create_user(password=password, **user_fields)
            user.is_staff = role in (self.Role.STAFF, self.Role.ADMIN)
            user.is_superuser = False
        user.is_active = is_active
        user.save(update_fields=["is_staff", "is_superuser", "is_active"])
        profile, _ = UserProfile.objects.update_or_create(user=user, defaults={"role": role})
        user.profile = profile
        if role == self.Role.CUSTOMER:
            account, _ = CustomerAccount.objects.get_or_create(
                user=user, defaults={"email": user.email}
            )
            Cart.objects.get_or_create(customer=account)
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        role = validated_data.pop("role", None)
        if role == self.Role.SUPERUSER:
            role = self.Role.SUPERADMIN
        password = validated_data.pop("password", None)
        email = validated_data.get("email", instance.email)
        for field in ("username", "email", "first_name", "last_name", "is_active"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        if password:
            instance.set_password(password)
        if role is not None:
            instance.is_staff = role in (self.Role.STAFF, self.Role.ADMIN, self.Role.SUPERADMIN)
            instance.is_superuser = role == self.Role.SUPERADMIN
            profile, _ = UserProfile.objects.update_or_create(user=instance, defaults={"role": role})
            instance.profile = profile
            if role == self.Role.CUSTOMER and not hasattr(instance, "customer_account"):
                account, _ = CustomerAccount.objects.get_or_create(
                    user=instance, defaults={"email": email}
                )
                Cart.objects.get_or_create(customer=account)
        instance.save()
        if hasattr(instance, "customer_account") and "email" in validated_data:
            instance.customer_account.email = email
            instance.customer_account.save(update_fields=["email"])
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["role"] = get_user_role(instance)
        return data


class StaffCustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerAccount
        fields = ["id", "email", "created_at"]
        read_only_fields = fields


class CartItemCreateSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)


class CartItemUpdateSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)


class CartProductSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    slug = serializers.SlugField(read_only=True)
    product_type = serializers.CharField(read_only=True)
    price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        allow_null=True,
        read_only=True,
    )
    currency = serializers.CharField(read_only=True)


class CartItemSerializer(serializers.ModelSerializer):
    product = serializers.SerializerMethodField()
    is_available = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = [
            "id",
            "product",
            "quantity",
            "is_available",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    @staticmethod
    def _is_eligible(product):
        return (
            product.publication_status == Product.PublicationStatus.PUBLISHED
            and product.product_type == Product.ProductType.SPARE_PART
            and product.sales_method == Product.SalesMethod.DIRECT_PURCHASE
            and product.price is not None
            and product.price > 0
            and product.currency == "GHS"
        )

    def get_product(self, item):
        if not self._is_eligible(item.product):
            return None
        return CartProductSerializer(item.product).data

    def get_is_available(self, item):
        if not self._is_eligible(item.product):
            return False
        try:
            return item.product.inventory.available_quantity >= item.quantity
        except InventoryRecord.DoesNotExist:
            return False


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ["id", "items", "item_count", "created_at", "updated_at"]
        read_only_fields = fields

    def get_item_count(self, cart):
        return sum(item.quantity for item in cart.items.all())


class WishlistItemCreateSerializer(serializers.Serializer):
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.filter(
            publication_status=Product.PublicationStatus.PUBLISHED,
        ),
        error_messages={
            "does_not_exist": "A published catalogue product with this ID was not found.",
            "incorrect_type": "Provide a valid product ID.",
        },
    )


class WishlistItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)

    class Meta:
        model = WishlistItem
        fields = ["id", "product", "created_at"]
        read_only_fields = fields
