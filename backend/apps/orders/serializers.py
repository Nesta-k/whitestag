from rest_framework import serializers

from .models import (
    DeliveryPricingAuditLog,
    DeliveryPricingConfiguration,
    DeliverySurcharge,
    DeliveryZone,
    Order,
    OrderItem,
    Payment,
    PaymentRefund,
)


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


class SuperuserDeliveryPricingConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryPricingConfiguration
        fields = [
            "id",
            "version",
            "is_active",
            "base_fee",
            "rate_per_km",
            "rate_per_kg",
            "minimum_fee",
            "maximum_fee",
            "currency",
            "rounding_mode",
            "review_weight_threshold_kg",
            "review_distance_threshold_km",
            "review_fee_threshold",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]

    def validate(self, attrs):
        if self.instance:
            commercial_fields = (
                "base_fee",
                "rate_per_km",
                "rate_per_kg",
                "minimum_fee",
                "maximum_fee",
                "rounding_mode",
                "currency",
            )
            rate_changed = any(
                field in attrs
                and attrs[field] != getattr(self.instance, field)
                for field in commercial_fields
            )
            version = attrs.get("version", self.instance.version)
            if rate_changed and version == self.instance.version:
                raise serializers.ValidationError(
                    {
                        "version": (
                            "Change the formula version when changing commercial rates."
                        )
                    }
                )
        minimum_fee = attrs.get(
            "minimum_fee",
            getattr(self.instance, "minimum_fee", None),
        )
        maximum_fee = attrs.get(
            "maximum_fee",
            getattr(self.instance, "maximum_fee", None),
        )
        if maximum_fee is not None and minimum_fee is not None and maximum_fee < minimum_fee:
            raise serializers.ValidationError(
                {"maximum_fee": "Maximum fee must be at least the minimum fee."}
            )
        if attrs.get("is_active", False):
            active_configurations = DeliveryPricingConfiguration.objects.filter(
                is_active=True,
            )
            if self.instance:
                active_configurations = active_configurations.exclude(
                    pk=self.instance.pk
                )
            if active_configurations.exists():
                raise serializers.ValidationError(
                    {"is_active": "Deactivate the current active formula first."}
                )
        return attrs


class SuperuserDeliveryZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryZone
        fields = [
            "id",
            "code",
            "name",
            "city",
            "region",
            "estimated_distance_km",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        city = attrs.get("city", getattr(self.instance, "city", "")).strip()
        region = attrs.get("region", getattr(self.instance, "region", "")).strip()
        zones = DeliveryZone.objects.filter(
            city__iexact=city,
            region__iexact=region,
        )
        if self.instance:
            zones = zones.exclude(pk=self.instance.pk)
        if zones.exists():
            raise serializers.ValidationError(
                {"city": "A zone already exists for this city and region."}
            )
        return attrs


class SuperuserDeliverySurchargeSerializer(serializers.ModelSerializer):
    zone_id = serializers.PrimaryKeyRelatedField(
        source="zone",
        queryset=DeliveryZone.objects.all(),
        required=False,
        allow_null=True,
    )
    zone_code = serializers.CharField(source="zone.code", read_only=True, allow_null=True)

    class Meta:
        model = DeliverySurcharge
        fields = [
            "id",
            "code",
            "name",
            "amount",
            "zone_id",
            "zone_code",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "zone_code", "created_at", "updated_at"]


class DeliveryPricingAuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(
        source="actor.username",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = DeliveryPricingAuditLog
        fields = [
            "configuration_type",
            "object_id",
            "object_label",
            "action",
            "actor_username",
            "before_state",
            "after_state",
            "created_at",
        ]
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


class StaffPaymentSerializer(serializers.ModelSerializer):
    order_reference = serializers.UUIDField(source="order.public_reference")
    order_status = serializers.CharField(source="order.status")
    payment_status = serializers.CharField(source="order.payment_status")
    customer_email = serializers.EmailField(source="order.shipping_email")

    class Meta:
        model = Payment
        fields = [
            "reference",
            "status",
            "amount",
            "currency",
            "order_reference",
            "order_status",
            "payment_status",
            "customer_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class PaymentRefundResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentRefund
        fields = ["reference", "status", "amount_minor", "currency"]
        read_only_fields = fields
