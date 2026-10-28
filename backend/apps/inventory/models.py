from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.catalogue.models import Product


class InventoryRecord(models.Model):
    product = models.OneToOneField(
        Product,
        related_name="inventory",
        on_delete=models.PROTECT,
    )
    available_quantity = models.IntegerField(default=0)
    reserved_quantity = models.IntegerField(default=0)
    reorder_threshold = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["product__sku"]
        constraints = [
            models.CheckConstraint(
                condition=Q(available_quantity__gte=0),
                name="inventory_available_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(reserved_quantity__gte=0),
                name="inventory_reserved_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(reorder_threshold__gte=0),
                name="inventory_reorder_nonnegative",
            ),
        ]

    def __str__(self):
        return f"{self.product.sku}: {self.available_quantity} available"


class StockMovement(models.Model):
    class MovementType(models.TextChoices):
        RECEIPT = "receipt", "Receipt"
        ADJUSTMENT = "adjustment", "Adjustment"
        RESERVATION = "reservation", "Reservation"
        RELEASE = "release", "Release"
        SALE = "sale", "Sale"
        RETURN = "return", "Return"

    inventory_record = models.ForeignKey(
        InventoryRecord,
        related_name="movements",
        on_delete=models.PROTECT,
    )
    movement_type = models.CharField(max_length=16, choices=MovementType.choices)
    quantity = models.PositiveIntegerField()
    available_delta = models.IntegerField()
    reserved_delta = models.IntegerField()
    available_before = models.IntegerField()
    reserved_before = models.IntegerField()
    available_after = models.IntegerField()
    reserved_after = models.IntegerField()
    idempotency_key = models.UUIDField()
    reason = models.CharField(max_length=255, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="stock_movements",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["idempotency_key"],
                name="uniq_stock_movement_idempotency_key",
            ),
            models.CheckConstraint(
                condition=Q(quantity__gt=0),
                name="movement_quantity_positive",
            ),
            models.CheckConstraint(
                condition=Q(available_delta__gt=0)
                | Q(available_delta__lt=0)
                | Q(reserved_delta__gt=0)
                | Q(reserved_delta__lt=0),
                name="movement_must_change_stock",
            ),
            models.CheckConstraint(
                condition=Q(available_before__gte=0)
                & Q(reserved_before__gte=0)
                & Q(available_after__gte=0)
                & Q(reserved_after__gte=0),
                name="movement_snapshots_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(available_after=F("available_before") + F("available_delta")),
                name="movement_available_snapshot_consistent",
            ),
            models.CheckConstraint(
                condition=Q(reserved_after=F("reserved_before") + F("reserved_delta")),
                name="movement_reserved_snapshot_consistent",
            ),
        ]

    def __str__(self):
        return (
            f"{self.inventory_record.product.sku} "
            f"{self.get_movement_type_display()} {self.quantity}"
        )
