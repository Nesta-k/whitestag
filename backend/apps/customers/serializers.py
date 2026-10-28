from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.catalogue.models import Product
from apps.catalogue.serializers import ProductSerializer
from apps.inventory.models import InventoryRecord

from .models import Cart, CartItem, CustomerAccount, WishlistItem


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
