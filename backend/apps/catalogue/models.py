from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q


class ProductType(models.TextChoices):
    SPARE_PART = "spare_part", "Spare part"
    CAR = "car", "Car"
    ELECTRIC_VEHICLE = "electric_vehicle", "Electric vehicle"
    TRICYCLE = "tricycle", "Motorized tricycle"
    MOTORCYCLE_BIKE = "motorcycle_bike", "Motorcycle or bike"
    OTHER = "other", "Other"


class Category(models.Model):
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=180, unique=True)
    description = models.TextField(blank=True)
    product_type = models.CharField(
        max_length=24,
        choices=ProductType.choices,
        default=ProductType.SPARE_PART,
        db_index=True,
        help_text="The primary product type associated with this category.",
    )
    image_url = models.CharField(max_length=500, blank=True)
    is_featured = models.BooleanField(default=False)
    featured_order = models.PositiveIntegerField(default=0)
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
    logo_url = models.CharField(
        max_length=500,
        blank=True,
        help_text="URL of the brand logo image.",
    )
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Product(models.Model):
    ProductType = ProductType

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
        blank=True,
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
    is_featured = models.BooleanField(default=False)
    featured_order = models.PositiveIntegerField(default=0)
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

    def clean(self):
        super().clean()
        if self.pk and self.images.count() > 3:
            raise ValidationError("A product can take up to 3 product images.")

    def save(self, *args, **kwargs):
        if not self.product_type and self.category_id:
            try:
                self.product_type = self.category.product_type
            except Exception:
                pass
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.sku} - {self.name}"


class ProductImage(models.Model):
    product = models.ForeignKey(
        Product,
        related_name="images",
        on_delete=models.CASCADE,
    )
    image_url = models.CharField(max_length=500)
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

    def clean(self):
        super().clean()
        if self.product_id:
            existing = ProductImage.objects.filter(product_id=self.product_id)
            if self.pk:
                existing = existing.exclude(pk=self.pk)
            if existing.count() >= 3:
                raise ValidationError("A product can take up to 3 product images.")

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


HOMEPAGE_SECTION_KEYS = [
    "hero",
    "categories",
    "promotions",
    "featured_products",
    "brands",
    "preorders",
    "vehicles",
    "how_it_works",
    "support",
]


def default_homepage_section_order():
    return list(HOMEPAGE_SECTION_KEYS)


class HomepageSettings(models.Model):
    hero_kicker = models.CharField(max_length=120, default="WhiteStag automotive")
    hero_heading = models.CharField(
        max_length=200,
        default="Parts for the road ahead.",
    )
    hero_subtitle = models.CharField(
        max_length=255,
        default="Find the right parts. Keep your vehicle moving.",
    )
    hero_description = models.TextField(
        default=(
            "Explore our live catalogue of automotive spares, or talk with our "
            "team about vehicles and tricycles."
        ),
    )
    hero_image_url = models.CharField(max_length=500, blank=True)
    hero_image_alt = models.CharField(max_length=255, blank=True)
    hero_primary_cta_label = models.CharField(
        max_length=80,
        default="Shop spare parts",
    )
    hero_primary_cta_href = models.CharField(max_length=300, default="/products")
    hero_secondary_cta_label = models.CharField(
        max_length=80,
        default="Explore vehicles",
    )
    hero_secondary_cta_href = models.CharField(max_length=300, default="/vehicles")
    categories_eyebrow = models.CharField(max_length=120, default="Explore WhiteStag")
    categories_heading = models.CharField(max_length=200, default="Shop by category")
    promotions_eyebrow = models.CharField(
        max_length=120,
        default="Offers from WhiteStag",
    )
    promotions_heading = models.CharField(
        max_length=200,
        default="Featured Promotions",
    )
    featured_products_eyebrow = models.CharField(
        max_length=120,
        default="Available from our catalogue",
    )
    featured_products_heading = models.CharField(
        max_length=200,
        default="Spare parts for every journey",
    )
    brands_eyebrow = models.CharField(
        max_length=120,
        default="Discover the catalogue",
    )
    brands_heading = models.CharField(max_length=200, default="Browse by brand")
    preorders_eyebrow = models.CharField(
        max_length=120,
        default="Coming when available",
    )
    preorders_heading = models.CharField(max_length=200, default="Preorders")
    preorders_body = models.TextField(
        default="There are no preorder items published at this time.",
    )
    vehicles_eyebrow = models.CharField(max_length=120, default="More than spare parts")
    vehicles_heading = models.CharField(
        max_length=200,
        default="Looking for a vehicle or tricycle?",
    )
    vehicles_body = models.TextField(
        default=(
            "Explore available catalogue listings or speak with our team about a quote."
        ),
    )
    how_it_works_eyebrow = models.CharField(
        max_length=120,
        default="Straightforward from start to finish",
    )
    how_it_works_heading = models.CharField(
        max_length=200,
        default="How WhiteStag works",
    )
    support_eyebrow = models.CharField(max_length=120, default="Need a hand?")
    support_heading = models.CharField(
        max_length=200,
        default="Not sure which part fits?",
    )
    support_body = models.TextField(
        default=(
            "Browse product specifications, or ask our team about the right fit "
            "for your vehicle."
        ),
    )
    show_hero = models.BooleanField(default=True)
    show_categories = models.BooleanField(default=True)
    show_promotions = models.BooleanField(default=True)
    show_featured_products = models.BooleanField(default=True)
    show_brands = models.BooleanField(default=True)
    show_preorders = models.BooleanField(default=True)
    show_vehicles = models.BooleanField(default=True)
    show_how_it_works = models.BooleanField(default=True)
    show_support = models.BooleanField(default=True)
    section_order = models.JSONField(default=default_homepage_section_order)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Homepage settings"
        verbose_name_plural = "Homepage settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return "Homepage settings"

    @classmethod
    def load(cls):
        obj, _created = cls.objects.get_or_create(pk=1)
        return obj


class Promotion(models.Model):
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    description = models.TextField(blank=True)
    image_url = models.CharField(max_length=500, blank=True)
    image_alt = models.CharField(max_length=255, blank=True)
    cta_label = models.CharField(max_length=80, blank=True)
    cta_href = models.CharField(max_length=300, blank=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=False)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "-updated_at", "pk"]

    def __str__(self):
        return self.title
