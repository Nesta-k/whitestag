from django.db import transaction

from apps.catalogue.models import Product
from apps.inventory.models import InventoryRecord

from .models import Cart, CartItem, CustomerAccount


class ProductNotPurchasable(Exception):
    pass


class ProductUnavailable(Exception):
    pass


def _validate_quantity(quantity):
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity <= 0:
        raise ValueError("Quantity must be a positive integer.")


def _lock_purchasable_product(product_id):
    try:
        product = Product.objects.select_for_update().get(pk=product_id)
    except Product.DoesNotExist as exc:
        raise ProductNotPurchasable("This product cannot be added to the cart.") from exc

    if (
        product.publication_status != Product.PublicationStatus.PUBLISHED
        or product.sales_method != Product.SalesMethod.DIRECT_PURCHASE
        or product.price is None
        or product.price <= 0
        or product.currency != "GHS"
    ):
        raise ProductNotPurchasable("This product cannot be added to the cart.")
    return product


def _lock_inventory(product):
    inventory = (
        InventoryRecord.objects.select_for_update()
        .filter(product=product)
        .first()
    )
    if inventory is None:
        raise ProductUnavailable("This product is currently unavailable.")
    return inventory


def add_cart_item(customer_id, product_id, quantity):
    _validate_quantity(quantity)
    with transaction.atomic():
        cart = Cart.objects.select_for_update().get(customer_id=customer_id)
        product = _lock_purchasable_product(product_id)
        inventory = _lock_inventory(product)

        item = CartItem.objects.filter(cart=cart, product=product).first()
        new_quantity = quantity + (item.quantity if item is not None else 0)
        if inventory.available_quantity < new_quantity:
            raise ProductUnavailable("Requested quantity is not currently available.")

        if item is None:
            item = CartItem.objects.create(
                cart=cart,
                product=product,
                quantity=quantity,
            )
        else:
            item.quantity = new_quantity
            item.save(update_fields=["quantity", "updated_at"])
        return item


def update_cart_item_quantity(customer_id, item_id, quantity):
    _validate_quantity(quantity)
    with transaction.atomic():
        cart = Cart.objects.select_for_update().get(customer_id=customer_id)
        item = CartItem.objects.select_for_update().filter(
            cart=cart,
            pk=item_id,
        ).first()
        if item is None:
            return None

        product = _lock_purchasable_product(item.product_id)
        inventory = _lock_inventory(product)
        if inventory.available_quantity < quantity:
            raise ProductUnavailable("Requested quantity is not currently available.")

        item.quantity = quantity
        item.save(update_fields=["quantity", "updated_at"])
        return item


def remove_cart_item(customer_id, item_id):
    with transaction.atomic():
        cart = Cart.objects.select_for_update().get(customer_id=customer_id)
        item = CartItem.objects.filter(cart=cart, pk=item_id).first()
        if item is None:
            return False
        item.delete()
        return True
