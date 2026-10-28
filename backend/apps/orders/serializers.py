from rest_framework import serializers

from .models import DeliveryZone, Order, OrderItem, Payment, PaymentRefund


class CheckoutInputSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=200)
    email = serializers.EmailField(max_length=254)
    phone = serializers.CharField(max_length=32)
    address_line_1 = serializers.CharField(max_length=255)
    address_line_2 = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        default="",
    )
    city = serializers.CharField(max_length=100)
    region = serializers.CharField(max_length=100)
    postal_code = serializers.CharField(
        max_length=24,
        required=False,
        allow_blank=True,
        default="",
    )
    country = serializers.RegexField(r"^[A-Z]{2}$", default="GH")


class DeliveryQuoteInputSerializer(serializers.Serializer):
    city = serializers.CharField(max_length=100)
    region = serializers.CharField(max_length=100)
    country = serializers.RegexField(r"^[A-Z]{2}$", default="GH")


class DeliveryZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryZone
        fields = ["code", "name", "city", "region", "estimated_distance_km"]
        read_only_fields = fields


class DeliverySurchargeQuoteSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class DeliveryQuoteSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["estimated", "manual_review"])
    requires_manual_review = serializers.BooleanField()
    review_reason = serializers.CharField(allow_blank=True)
    currency = serializers.CharField()
    base_fee = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True
    )
    distance_component = serializers.DecimalField(
        max_digits=24, decimal_places=4, allow_null=True
    )
    weight_component = serializers.DecimalField(
        max_digits=24, decimal_places=4, allow_null=True
    )
    surcharges = DeliverySurchargeQuoteSerializer(many=True)
    estimated_distance_km = serializers.DecimalField(
        max_digits=10, decimal_places=3, allow_null=True
    )
    shipment_weight_kg = serializers.DecimalField(
        max_digits=12, decimal_places=3, allow_null=True
    )
    distance_source = serializers.CharField(allow_blank=True)
    delivery_fee = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True
    )
    minimum_fee_applied = serializers.BooleanField()
    maximum_fee_applied = serializers.BooleanField()
    formula_version = serializers.CharField(allow_null=True)
    pricing_inputs = serializers.DictField()
    weighted_items = serializers.ListField(child=serializers.DictField())
    destination = serializers.DictField()
    subtotal = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True
    )
    order_total = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True
    )


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            "product_name",
            "product_sku",
            "quantity",
            "unit_price",
            "line_total",
            "product_weight_kg",
        ]
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "public_reference",
            "status",
            "payment_status",
            "currency",
            "subtotal",
            "delivery_fee",
            "discount",
            "total",
            "shipping_full_name",
            "shipping_email",
            "shipping_phone",
            "shipping_address_line_1",
            "shipping_address_line_2",
            "shipping_city",
            "shipping_region",
            "shipping_postal_code",
            "shipping_country",
            "delivery_zone_code",
            "delivery_zone_name",
            "shipment_weight_kg",
            "estimated_distance_km",
            "delivery_distance_source",
            "delivery_pricing_snapshot",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PaymentInitializationResponseSerializer(serializers.ModelSerializer):
    authorization_url = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = ["reference", "status", "authorization_url"]
        read_only_fields = fields

    def get_authorization_url(self, payment):
        return payment.authorization_url or None


class PaymentVerificationResponseSerializer(serializers.Serializer):
    reference = serializers.CharField()
    status = serializers.CharField()
    outcome = serializers.CharField()


class PaymentRefundResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentRefund
        fields = ["reference", "status", "amount_minor", "currency"]
        read_only_fields = fields
