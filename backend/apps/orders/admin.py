from django.contrib import admin
from django.db import transaction

from .models import (
    DeliveryPricingAuditLog,
    DeliveryPricingConfiguration,
    DeliverySurcharge,
    DeliveryZone,
    Order,
    OrderItem,
    Payment,
    PaymentEvent,
    PaymentRefund,
)


class DeliveryPricingAuditAdminMixin:
    audit_type = None
    audit_fields = ()

    def _audit_state(self, obj):
        state = {}
        for field in self.audit_fields:
            value = getattr(obj, field)
            if hasattr(value, "isoformat"):
                value = value.isoformat()
            elif value is not None:
                value = str(value)
            state[field] = value
        return state

    def _record_audit(self, request, obj, action, before_state, after_state):
        DeliveryPricingAuditLog.objects.create(
            configuration_type=self.audit_type,
            object_id=str(obj.pk),
            object_label=str(obj),
            action=action,
            actor=request.user,
            before_state=before_state,
            after_state=after_state,
        )

    def save_model(self, request, obj, form, change):
        before_state = None
        if change:
            previous = type(obj).objects.get(pk=obj.pk)
            before_state = self._audit_state(previous)
        super().save_model(request, obj, form, change)
        after_state = self._audit_state(obj)
        if before_state != after_state:
            self._record_audit(
                request,
                obj,
                (
                    DeliveryPricingAuditLog.Action.UPDATED
                    if change
                    else DeliveryPricingAuditLog.Action.CREATED
                ),
                before_state,
                after_state,
            )

    def delete_model(self, request, obj):
        before_state = self._audit_state(obj)
        with transaction.atomic():
            super().delete_model(request, obj)
            self._record_audit(
                request,
                obj,
                DeliveryPricingAuditLog.Action.DELETED,
                before_state,
                None,
            )

    def delete_queryset(self, request, queryset):
        objects = list(queryset)
        with transaction.atomic():
            super().delete_queryset(request, queryset)
            for obj in objects:
                self._record_audit(
                    request,
                    obj,
                    DeliveryPricingAuditLog.Action.DELETED,
                    self._audit_state(obj),
                    None,
                )


@admin.register(DeliveryPricingConfiguration)
class DeliveryPricingConfigurationAdmin(
    DeliveryPricingAuditAdminMixin,
    admin.ModelAdmin,
):
    audit_type = DeliveryPricingAuditLog.ConfigurationType.PRICING
    audit_fields = (
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
    )
    list_display = (
        "version",
        "is_active",
        "currency",
        "base_fee",
        "rate_per_km",
        "rate_per_kg",
        "minimum_fee",
        "maximum_fee",
        "updated_at",
    )
    list_filter = ("is_active", "currency", "rounding_mode")
    search_fields = ("version",)
    readonly_fields = ("updated_at",)


@admin.register(DeliveryZone)
class DeliveryZoneAdmin(DeliveryPricingAuditAdminMixin, admin.ModelAdmin):
    audit_type = DeliveryPricingAuditLog.ConfigurationType.ZONE
    audit_fields = (
        "code",
        "name",
        "city",
        "region",
        "estimated_distance_km",
        "legacy_delivery_fee",
        "is_active",
    )
    list_display = (
        "code",
        "name",
        "city",
        "region",
        "estimated_distance_km",
        "is_active",
    )
    list_filter = ("is_active", "region")
    search_fields = ("code", "name", "city", "region")
    ordering = ("region", "city", "name")
    readonly_fields = ("legacy_delivery_fee", "created_at", "updated_at")


@admin.register(DeliverySurcharge)
class DeliverySurchargeAdmin(
    DeliveryPricingAuditAdminMixin,
    admin.ModelAdmin,
):
    audit_type = DeliveryPricingAuditLog.ConfigurationType.SURCHARGE
    audit_fields = ("code", "name", "amount", "zone_id", "is_active")
    list_display = ("code", "name", "amount", "zone", "is_active", "updated_at")
    list_filter = ("is_active", "zone")
    search_fields = ("code", "name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(DeliveryPricingAuditLog)
class DeliveryPricingAuditLogAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "configuration_type",
        "object_label",
        "action",
        "actor",
    )
    list_filter = ("configuration_type", "action", "created_at")
    search_fields = ("object_label", "object_id", "actor__username")
    readonly_fields = tuple(
        field.name for field in DeliveryPricingAuditLog._meta.fields
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    fields = (
        "product",
        "product_name",
        "product_sku",
        "quantity",
        "unit_price",
        "line_total",
    )
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "public_reference",
        "customer",
        "status",
        "payment_status",
        "currency",
        "total",
        "created_at",
    )
    list_filter = ("status", "payment_status", "currency", "created_at")
    search_fields = (
        "public_reference",
        "customer__email",
        "shipping_email",
        "shipping_full_name",
    )
    readonly_fields = tuple(
        field.name for field in Order._meta.fields
    )
    inlines = [OrderItemInline]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "order",
        "provider",
        "status",
        "amount",
        "currency",
        "created_at",
    )
    list_filter = ("provider", "status", "currency", "created_at")
    search_fields = (
        "reference",
        "provider_transaction_id",
        "order__public_reference",
        "order__customer__email",
    )
    readonly_fields = tuple(field.name for field in Payment._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PaymentEvent)
class PaymentEventAdmin(admin.ModelAdmin):
    list_display = (
        "event_type",
        "payment",
        "processing_status",
        "received_at",
        "processed_at",
    )
    list_filter = ("provider", "processing_status", "event_type", "received_at")
    search_fields = ("deduplication_key", "event_identifier", "payload_digest")
    readonly_fields = tuple(field.name for field in PaymentEvent._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PaymentRefund)
class PaymentRefundAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "payment",
        "status",
        "amount_minor",
        "currency",
        "provider_refund_id",
        "created_at",
    )
    list_filter = ("status", "currency", "created_at")
    search_fields = (
        "reference",
        "payment__reference",
        "payment__order__public_reference",
        "provider_refund_id",
    )
    readonly_fields = tuple(field.name for field in PaymentRefund._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
