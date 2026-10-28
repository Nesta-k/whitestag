from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q


class Category(models.Model):
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=180, unique=True)
    description = models.TextField(blank=True)
    parent = models.ForeignKey(
        "self",
        related_name="children",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(parent=models.F("pk")),
                name="category_cannot_parent_self",
            ),
        ]

    def __str__(self):
        return self.name


class Brand(models.Model):
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=180, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(models.Model):
    class ProductType(models.TextChoices):
        SPARE_PART = "spare_part", "Spare part"
        CAR = "car", "Car"
        ELECTRIC_VEHICLE = "electric_vehicle", "Electric vehicle"
        TRICYCLE = "tricycle", "Motorized tricycle"
        MOTORCYCLE_BIKE = "motorcycle_bike", "Motorcycle or bike"
        OTHER = "other", "Other"

    class SalesMethod(models.TextChoices):
        DIRECT_PURCHASE = "direct_purchase", "Direct purchase"
        QUOTATION = "quotation", "Quotation"

    class PublicationStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    sku = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    description = models.TextField(blank=True)
    category = models.ForeignKey(
        Category,
        related_name="products",
        on_delete=models.PROTECT,
    )
    brand = models.ForeignKey(
        Brand,
        related_name="products",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    product_type = models.CharField(
        max_length=24,
        choices=ProductType.choices,
    )
    sales_method = models.CharField(
        max_length=20,
        choices=SalesMethod.choices,
    )
    publication_status = models.CharField(
        max_length=12,
        choices=PublicationStatus.choices,
        default=PublicationStatus.DRAFT,
    )
    price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )
    weight_kg = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.001"))],
        help_text="Product shipping weight in kilograms. Leave blank if unknown.",
    )
    currency = models.CharField(max_length=3, default="GHS")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "pk"]
        indexes = [
            models.Index(
                fields=["publication_status", "category"],
                name="idx_prod_status_cat",
            ),
            models.Index(
                fields=["publication_status", "brand"],
                name="idx_prod_status_brand",
            ),
            models.Index(
                fields=["publication_status", "product_type"],
                name="idx_prod_status_type",
            ),
            models.Index(
                fields=["publication_status", "sales_method"],
                name="idx_prod_status_sales",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(price__isnull=True) | Q(price__gte=0),
                name="product_price_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(weight_kg__isnull=True) | Q(weight_kg__gt=0),
                name="product_weight_positive_or_unknown",
            ),
        ]

    def __str__(self):
        return f"{self.sku} - {self.name}"


class ProductImage(models.Model):
    product = models.ForeignKey(
        Product,
        related_name="images",
        on_delete=models.CASCADE,
    )
    image_url = models.URLField(max_length=500)
    alt_text = models.CharField(max_length=255)
    display_order = models.PositiveIntegerField(default=0)
    is_primary = models.BooleanField(default=False)

    class Meta:
        ordering = ["display_order", "pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "display_order"],
                name="uniq_prod_image_order",
            ),
            models.UniqueConstraint(
                fields=["product"],
                condition=Q(is_primary=True),
                name="uniq_prod_primary_image",
            ),
        ]

    def __str__(self):
        return f"{self.product.sku} image {self.display_order}"


class ProductSpecification(models.Model):
    product = models.ForeignKey(
        Product,
        related_name="specifications",
        on_delete=models.CASCADE,
    )
    name = models.CharField(max_length=100)
    value = models.TextField()

    class Meta:
        ordering = ["name", "pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "name"],
                name="uniq_spec_product_name",
            ),
        ]

    def __str__(self):
        return f"{self.product.sku}: {self.name}"
