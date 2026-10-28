from dataclasses import dataclass
from uuid import UUID

from django.db import IntegrityError, transaction

from apps.catalogue.models import Product

from .models import InventoryRecord, StockMovement


class StockOperationError(Exception):
    pass


class InvalidStockOperation(StockOperationError):
    pass


class InsufficientStock(StockOperationError):
    pass


class IdempotencyConflict(StockOperationError):
    pass


@dataclass(frozen=True)
class StockOperationResult:
    inventory: InventoryRecord
    movement: StockMovement


def _validate_quantity(quantity):
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity <= 0:
        raise InvalidStockOperation("Quantity must be a positive integer.")


def _normalize_idempotency_key(idempotency_key):
    try:
        return UUID(str(idempotency_key))
    except (TypeError, ValueError, AttributeError) as exc:
        raise InvalidStockOperation("A valid idempotency key is required.") from exc


def _matches_request(
    movement,
    product_id,
    *,
    movement_type,
    quantity,
    reason,
    reference,
    adjustment_delta,
):
    return (
        movement.inventory_record.product_id == product_id
        and movement.movement_type == movement_type
        and movement.quantity == quantity
        and movement.reason == reason
        and movement.reference == reference
        and (
            adjustment_delta is None
            or movement.available_delta == adjustment_delta
        )
    )


def _find_movement(idempotency_key):
    return (
        StockMovement.objects.select_related("inventory_record")
        .filter(idempotency_key=idempotency_key)
        .first()
    )


def _apply_movement(
    product_id,
    *,
    movement_type,
    quantity,
    idempotency_key,
    reason="",
    reference="",
    created_by=None,
    adjustment_delta=None,
):
    _validate_quantity(quantity)
    idempotency_key = _normalize_idempotency_key(idempotency_key)

    if not isinstance(reason, str) or len(reason) > 255:
        raise InvalidStockOperation("Reason must be a string of at most 255 characters.")
    if not isinstance(reference, str) or len(reference) > 100:
        raise InvalidStockOperation(
            "Reference must be a string of at most 100 characters."
        )

    try:
        with transaction.atomic():
            product = Product.objects.select_for_update().get(pk=product_id)

            existing = _find_movement(idempotency_key)
            if existing is not None:
                if not _matches_request(
                    existing,
                    product.pk,
                    movement_type=movement_type,
                    quantity=quantity,
                    reason=reason,
                    reference=reference,
                    adjustment_delta=adjustment_delta,
                ):
                    raise IdempotencyConflict(
                        "This idempotency key was already used for a different operation."
                    )
                inventory = InventoryRecord.objects.select_for_update().get(
                    product=product
                )
                return StockOperationResult(inventory, existing)

            inventory, _ = InventoryRecord.objects.get_or_create(product=product)
            inventory = InventoryRecord.objects.select_for_update().get(pk=inventory.pk)

            available_before = inventory.available_quantity
            reserved_before = inventory.reserved_quantity
            available_delta = 0
            reserved_delta = 0

            if movement_type == StockMovement.MovementType.RECEIPT:
                available_delta = quantity
            elif movement_type == StockMovement.MovementType.ADJUSTMENT:
                if (
                    isinstance(adjustment_delta, bool)
                    or not isinstance(adjustment_delta, int)
                    or adjustment_delta == 0
                    or abs(adjustment_delta) != quantity
                ):
                    raise InvalidStockOperation(
                        "Adjustment must be a non-zero signed integer quantity."
                    )
                available_delta = adjustment_delta
            elif movement_type == StockMovement.MovementType.RESERVATION:
                available_delta = -quantity
                reserved_delta = quantity
            elif movement_type == StockMovement.MovementType.RELEASE:
                available_delta = quantity
                reserved_delta = -quantity
            elif movement_type == StockMovement.MovementType.SALE:
                reserved_delta = -quantity
            elif movement_type == StockMovement.MovementType.RETURN:
                available_delta = quantity
            else:
                raise InvalidStockOperation("Unsupported stock movement type.")

            available_after = available_before + available_delta
            reserved_after = reserved_before + reserved_delta
            if available_after < 0:
                raise InsufficientStock("Insufficient available stock.")
            if reserved_after < 0:
                raise InsufficientStock("Insufficient reserved stock.")

            inventory.available_quantity = available_after
            inventory.reserved_quantity = reserved_after
            inventory.save(
                update_fields=[
                    "available_quantity",
                    "reserved_quantity",
                    "updated_at",
                ]
            )
            movement = StockMovement.objects.create(
                inventory_record=inventory,
                movement_type=movement_type,
                quantity=quantity,
                available_delta=available_delta,
                reserved_delta=reserved_delta,
                available_before=available_before,
                reserved_before=reserved_before,
                available_after=available_after,
                reserved_after=reserved_after,
                idempotency_key=idempotency_key,
                reason=reason,
                reference=reference,
                created_by=created_by,
            )
            return StockOperationResult(inventory, movement)
    except IntegrityError as exc:
        existing = _find_movement(idempotency_key)
        if existing is None:
            raise
        if not _matches_request(
            existing,
            product_id,
            movement_type=movement_type,
            quantity=quantity,
            reason=reason,
            reference=reference,
            adjustment_delta=adjustment_delta,
        ):
            raise IdempotencyConflict(
                "This idempotency key was already used for a different operation."
            ) from exc
        inventory = InventoryRecord.objects.get(product_id=product_id)
        return StockOperationResult(inventory, existing)


def receive_stock(
    product_id, quantity, *, idempotency_key, reason="", reference="", created_by=None
):
    return _apply_movement(
        product_id,
        movement_type=StockMovement.MovementType.RECEIPT,
        quantity=quantity,
        idempotency_key=idempotency_key,
        reason=reason,
        reference=reference,
        created_by=created_by,
    )


def adjust_stock(
    product_id, adjustment, *, idempotency_key, reason="", reference="", created_by=None
):
    if isinstance(adjustment, bool) or not isinstance(adjustment, int) or adjustment == 0:
        raise InvalidStockOperation(
            "Adjustment must be a non-zero signed integer quantity."
        )
    return _apply_movement(
        product_id,
        movement_type=StockMovement.MovementType.ADJUSTMENT,
        quantity=abs(adjustment),
        adjustment_delta=adjustment,
        idempotency_key=idempotency_key,
        reason=reason,
        reference=reference,
        created_by=created_by,
    )


def reserve_stock(
    product_id, quantity, *, idempotency_key, reason="", reference="", created_by=None
):
    return _apply_movement(
        product_id,
        movement_type=StockMovement.MovementType.RESERVATION,
        quantity=quantity,
        idempotency_key=idempotency_key,
        reason=reason,
        reference=reference,
        created_by=created_by,
    )


def release_reservation(
    product_id, quantity, *, idempotency_key, reason="", reference="", created_by=None
):
    return _apply_movement(
        product_id,
        movement_type=StockMovement.MovementType.RELEASE,
        quantity=quantity,
        idempotency_key=idempotency_key,
        reason=reason,
        reference=reference,
        created_by=created_by,
    )


def record_sale(
    product_id, quantity, *, idempotency_key, reason="", reference="", created_by=None
):
    return _apply_movement(
        product_id,
        movement_type=StockMovement.MovementType.SALE,
        quantity=quantity,
        idempotency_key=idempotency_key,
        reason=reason,
        reference=reference,
        created_by=created_by,
    )


def record_return(
    product_id, quantity, *, idempotency_key, reason="", reference="", created_by=None
):
    return _apply_movement(
        product_id,
        movement_type=StockMovement.MovementType.RETURN,
        quantity=quantity,
        idempotency_key=idempotency_key,
        reason=reason,
        reference=reference,
        created_by=created_by,
    )
