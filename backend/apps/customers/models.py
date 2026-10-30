from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.catalogue.models import Product


class UserProfile(models.Model):
    class Role(models.TextChoices):
        SUPERADMIN = "superadmin", "Superadmin (Developer)"
        ADMIN = "admin", "Admin (Owner)"
        STAFF = "staff", "Staff"
        CUSTOMER = "customer", "Customer"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        related_name="profile",
        on_delete=models.CASCADE,
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CUSTOMER,
        db_index=True,
    )
    phone_number = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"


def get_user_role(user):
    """
    Resolves the four system roles:
    - superadmin: Developer
    - admin: Owner
    - staff: Operational staff
    - customer: Storefront buyer
    """
    if not user or not getattr(user, "is_authenticated", False):
        return None
    if getattr(user, "is_superuser", False):
        return str(UserProfile.Role.SUPERADMIN)
    try:
        profile = getattr(user, "profile", None)
        if profile is not None:
            return str(profile.role)
    except Exception:
        pass
    if getattr(user, "is_staff", False):
        return str(UserProfile.Role.STAFF)
    return str(UserProfile.Role.CUSTOMER)


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def ensure_user_profile(sender, instance, created, **kwargs):
    if not created:
        return
    if UserProfile.objects.filter(user=instance).exists():
        return
    initial_role = (
        UserProfile.Role.SUPERADMIN
        if instance.is_superuser
        else UserProfile.Role.STAFF
        if instance.is_staff
        else UserProfile.Role.CUSTOMER
    )
    profile, _ = UserProfile.objects.get_or_create(user=instance, defaults={"role": initial_role})
    instance.profile = profile



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
