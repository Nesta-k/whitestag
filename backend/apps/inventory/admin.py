from django.contrib import admin

from .models import InventoryRecord, StockMovement


@admin.register(InventoryRecord)
class InventoryRecordAdmin(admin.ModelAdmin):
    list_display = [
        "product",
        "available_quantity",
        "reserved_quantity",
        "reorder_threshold",
        "updated_at",
    ]
    list_filter = ["product__product_type", "product__sales_method"]
    search_fields = ["product__sku", "product__name", "product__slug"]
    readonly_fields = [
        "product",
        "available_quantity",
        "reserved_quantity",
        "created_at",
        "updated_at",
    ]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = [
        "created_at",
        "inventory_record",
        "movement_type",
        "quantity",
        "available_delta",
        "reserved_delta",
        "created_by",
        "reference",
    ]
    list_filter = ["movement_type", "created_at"]
    search_fields = [
        "inventory_record__product__sku",
        "inventory_record__product__name",
        "reference",
        "reason",
        "idempotency_key",
    ]
    readonly_fields = [
        field.name for field in StockMovement._meta.fields
    ]
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
