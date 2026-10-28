from rest_framework import serializers

from .models import InventoryRecord, StockMovement


class InventoryProductSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    sku = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    slug = serializers.SlugField(read_only=True)
    product_type = serializers.CharField(read_only=True)
    sales_method = serializers.CharField(read_only=True)


class InventoryRecordSerializer(serializers.ModelSerializer):
    product = InventoryProductSerializer(read_only=True)

    class Meta:
        model = InventoryRecord
        fields = [
            "id",
            "product",
            "available_quantity",
            "reserved_quantity",
            "reorder_threshold",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class StockMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockMovement
        fields = [
            "id",
            "movement_type",
            "quantity",
            "available_delta",
            "reserved_delta",
            "available_before",
            "reserved_before",
            "available_after",
            "reserved_after",
            "idempotency_key",
            "reason",
            "reference",
            "created_by",
            "created_at",
        ]
        read_only_fields = fields


class StockOperationInputSerializer(serializers.Serializer):
    idempotency_key = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True)


class StockAdjustmentInputSerializer(StockOperationInputSerializer):
    quantity = serializers.IntegerField()

    def validate_quantity(self, value):
        if value == 0:
            raise serializers.ValidationError("Adjustment must not be zero.")
        return value


class StockOperationResultSerializer(serializers.Serializer):
    inventory = InventoryRecordSerializer()
    movement = StockMovementSerializer()
