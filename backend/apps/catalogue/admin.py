from django.contrib import admin

from .models import Brand, Category, Product, ProductImage, ProductSpecification


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "parent", "updated_at"]
    list_filter = ["parent"]
    search_fields = ["name", "slug", "description"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "updated_at"]
    search_fields = ["name", "slug", "description"]
    prepopulated_fields = {"slug": ("name",)}


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 0


class ProductSpecificationInline(admin.TabularInline):
    model = ProductSpecification
    extra = 0


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "sku",
        "category",
        "brand",
        "product_type",
        "sales_method",
        "publication_status",
        "price",
        "weight_kg",
        "currency",
        "updated_at",
    ]
    list_filter = [
        "publication_status",
        "product_type",
        "sales_method",
        "category",
        "brand",
        "currency",
    ]
    search_fields = ["name", "sku", "slug", "description"]
    prepopulated_fields = {"slug": ("name",)}
    inlines = [ProductImageInline, ProductSpecificationInline]


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    list_display = ["product", "display_order", "is_primary", "image_url"]
    list_filter = ["is_primary"]
    search_fields = ["product__name", "product__sku", "alt_text", "image_url"]


@admin.register(ProductSpecification)
class ProductSpecificationAdmin(admin.ModelAdmin):
    list_display = ["product", "name"]
    search_fields = ["product__name", "product__sku", "name", "value"]
