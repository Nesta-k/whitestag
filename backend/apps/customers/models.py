from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from apps.catalogue.models import Product


class CustomerAccount(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        related_name="customer_account",
        on_delete=models.CASCADE,
    )
    email = models.EmailField(max_length=254)
    google_sub = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                name="uniq_customer_email_ci",
            ),
        ]

    def __str__(self):
        return self.email


class Cart(models.Model):
    customer = models.OneToOneField(
        CustomerAccount,
        related_name="cart",
        on_delete=models.CASCADE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Cart for {self.customer.email}"


class CartItem(models.Model):
    cart = models.ForeignKey(
        Cart,
        related_name="items",
        on_delete=models.CASCADE,
    )
    product = models.ForeignKey(
        Product,
        related_name="cart_items",
        on_delete=models.PROTECT,
    )
    quantity = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["cart", "product"],
                name="uniq_cart_product",
            ),
            models.CheckConstraint(
                condition=Q(quantity__gt=0),
                name="cart_item_quantity_positive",
            ),
        ]

    def __str__(self):
        return f"{self.product.sku} x {self.quantity}"


class WishlistItem(models.Model):
    customer = models.ForeignKey(
        CustomerAccount,
        related_name="wishlist_items",
        on_delete=models.CASCADE,
    )
    product = models.ForeignKey(
        Product,
        related_name="wishlist_items",
        on_delete=models.PROTECT,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "product"],
                name="uniq_wishlist_customer_product",
            ),
        ]

    def __str__(self):
        return f"{self.customer.email}: {self.product.sku}"
