from django import forms
from django.contrib import admin
from django.utils.html import mark_safe

from .media_service import upload_media_file
from .models import (
    Brand,
    Category,
    HomepageSettings,
    Product,
    ProductImage,
    ProductSpecification,
    Promotion,
)


# ==============================================================================
# Category Admin
# ==============================================================================

class CategoryAdminForm(forms.ModelForm):
    image_file = forms.FileField(
        required=False,
        label="Category Image File",
        help_text="Upload an image file (JPEG, PNG, WebP, GIF) up to 10 MB.",
    )

    class Meta:
        model = Category
        fields = [
            "name",
            "slug",
            "product_type",
            "parent",
            "description",
            "image_file",
            "is_featured",
            "featured_order",
        ]


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    form = CategoryAdminForm
    list_display = [
        "image_thumbnail",
        "name",
        "slug",
        "product_type",
        "parent",
        "is_featured",
        "updated_at",
    ]
    list_filter = ["product_type", "parent", "is_featured"]
    search_fields = ["name", "slug", "description"]
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ["current_image_preview"]
    fields = [
        "name",
        "slug",
        "product_type",
        "parent",
        "description",
        "current_image_preview",
        "image_file",
        "is_featured",
        "featured_order",
    ]

    def image_thumbnail(self, obj):
        if obj.image_url:
            return mark_safe(
                f'<img src="{obj.image_url}" style="height: 36px; width: 36px; object-fit: cover; border-radius: 4px;" />'
            )
        return "-"
    image_thumbnail.short_description = "Image"

    def current_image_preview(self, obj):
        if obj and obj.image_url:
            return mark_safe(
                f'<a href="{obj.image_url}" target="_blank">'
                f'<img src="{obj.image_url}" style="max-height: 120px; max-width: 200px; object-fit: contain; border-radius: 4px; border: 1px solid #ddd;" />'
                f'</a>'
            )
        return "No image uploaded yet"
    current_image_preview.short_description = "Current Image Preview"

    def save_model(self, request, obj, form, change):
        image_file = form.cleaned_data.get("image_file")
        if image_file:
            result = upload_media_file(image_file, folder="categories", request=request)
            obj.image_url = result["url"]
        super().save_model(request, obj, form, change)


# ==============================================================================
# Brand Admin
# ==============================================================================

class BrandAdminForm(forms.ModelForm):
    logo_file = forms.FileField(
        required=False,
        label="Brand Logo File",
        help_text="Upload a brand logo file (JPEG, PNG, WebP, GIF) up to 10 MB.",
    )

    class Meta:
        model = Brand
        fields = ["name", "slug", "description", "logo_file"]


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    form = BrandAdminForm
    list_display = ["logo_thumbnail", "name", "slug", "updated_at"]
    search_fields = ["name", "slug", "description"]
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ["current_logo_preview"]
    fields = ["name", "slug", "description", "current_logo_preview", "logo_file"]

    def logo_thumbnail(self, obj):
        if obj.logo_url:
            return mark_safe(
                f'<img src="{obj.logo_url}" style="height: 36px; width: 36px; object-fit: cover; border-radius: 4px;" />'
            )
        return "-"
    logo_thumbnail.short_description = "Logo"

    def current_logo_preview(self, obj):
        if obj and obj.logo_url:
            return mark_safe(
                f'<a href="{obj.logo_url}" target="_blank">'
                f'<img src="{obj.logo_url}" style="max-height: 120px; max-width: 200px; object-fit: contain; border-radius: 4px; border: 1px solid #ddd;" />'
                f'</a>'
            )
        return "No logo uploaded yet"
    current_logo_preview.short_description = "Current Logo Preview"

    def save_model(self, request, obj, form, change):
        logo_file = form.cleaned_data.get("logo_file")
        if logo_file:
            result = upload_media_file(logo_file, folder="brands", request=request)
            obj.logo_url = result["url"]
        super().save_model(request, obj, form, change)


# ==============================================================================
# Product Image Form & Admin
# ==============================================================================

class ProductImageAdminForm(forms.ModelForm):
    image_file = forms.FileField(
        required=False,
        label="Image File",
        help_text="Upload an image file (JPEG, PNG, WebP, GIF) up to 10 MB.",
    )

    class Meta:
        model = ProductImage
        fields = ["product", "image_file", "alt_text", "display_order", "is_primary"]

    def clean(self):
        cleaned_data = super().clean()
        image_file = cleaned_data.get("image_file")
        product = cleaned_data.get("product")

        if not self.instance.pk and not image_file and not getattr(self.instance, "image_url", ""):
            self.add_error("image_file", "An image file is required.")

        if product:
            existing = ProductImage.objects.filter(product=product)
            if self.instance.pk:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.count() >= 3:
                raise forms.ValidationError(
                    f"'{product.name}' already has 3 product images. A product can take up to 3 product images."
                )
            if cleaned_data.get("is_primary") and existing.filter(is_primary=True).exists():
                raise forms.ValidationError(
                    f"'{product.name}' already has a primary image. Uncheck 'Is primary' or change the other image first."
                )

        return cleaned_data


@admin.register(ProductImage)
class ProductImageAdmin(admin.ModelAdmin):
    form = ProductImageAdminForm
    list_display = ["thumbnail", "product", "display_order", "is_primary", "image_link"]
    list_filter = ["is_primary", "product"]
    search_fields = ["product__name", "product__sku", "alt_text"]
    readonly_fields = ["current_image_preview"]
    fields = [
        "product",
        "current_image_preview",
        "image_file",
        "alt_text",
        "display_order",
        "is_primary",
    ]

    def thumbnail(self, obj):
        if obj.image_url:
            return mark_safe(
                f'<img src="{obj.image_url}" style="height: 36px; width: 36px; object-fit: cover; border-radius: 4px;" />'
            )
        return "-"
    thumbnail.short_description = "Image"

    def image_link(self, obj):
        if obj.image_url:
            return mark_safe(
                f'<a href="{obj.image_url}" target="_blank" style="text-decoration: underline;">View File</a>'
            )
        return "-"
    image_link.short_description = "Uploaded File"

    def current_image_preview(self, obj):
        if obj and obj.image_url:
            return mark_safe(
                f'<a href="{obj.image_url}" target="_blank">'
                f'<img src="{obj.image_url}" style="max-height: 150px; max-width: 250px; object-fit: contain; border-radius: 4px; border: 1px solid #ccc;" />'
                f'</a>'
            )
        return "No image uploaded yet"
    current_image_preview.short_description = "Current Image Preview"

    def save_model(self, request, obj, form, change):
        image_file = form.cleaned_data.get("image_file")
        if image_file:
            result = upload_media_file(image_file, folder="products", request=request)
            obj.image_url = result["url"]
        super().save_model(request, obj, form, change)


class ProductImageInlineForm(forms.ModelForm):
    image_file = forms.FileField(
        required=False,
        label="Image File",
        help_text="Upload an image file (JPEG, PNG, WebP, GIF) up to 10 MB.",
    )

    class Meta:
        model = ProductImage
        fields = ["image_file", "alt_text", "display_order", "is_primary"]

    def clean(self):
        cleaned_data = super().clean()
        image_file = cleaned_data.get("image_file")
        if not self.instance.pk and not image_file and not getattr(self.instance, "image_url", ""):
            self.add_error("image_file", "An image file is required.")
        return cleaned_data


class ProductImageInlineFormSet(forms.BaseInlineFormSet):
    def clean(self):
        super().clean()
        valid_forms = [
            f for f in self.forms
            if f.cleaned_data and not f.cleaned_data.get("DELETE", False)
        ]
        if len(valid_forms) > 3:
            raise forms.ValidationError("A product can take up to 3 product images.")
        primary_count = sum(bool(f.cleaned_data.get("is_primary")) for f in valid_forms)
        if primary_count > 1:
            raise forms.ValidationError("A product can have only one primary image.")


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    form = ProductImageInlineForm
    formset = ProductImageInlineFormSet
    max_num = 3
    extra = 1
    fields = ["image_preview", "image_file", "alt_text", "display_order", "is_primary"]
    readonly_fields = ["image_preview"]

    def image_preview(self, obj):
        if obj and obj.image_url:
            return mark_safe(
                f'<a href="{obj.image_url}" target="_blank">'
                f'<img src="{obj.image_url}" style="height: 48px; width: 48px; object-fit: cover; border-radius: 4px; border: 1px solid #ccc;" />'
                f'</a>'
            )
        return "(New image)"
    image_preview.short_description = "Preview"


class ProductSpecificationInline(admin.TabularInline):
    model = ProductSpecification
    extra = 0


# ==============================================================================
# Product Admin
# ==============================================================================

class ProductAdminForm(forms.ModelForm):
    image_1 = forms.FileField(
        required=False,
        label="Product Image 1",
        help_text="Primary image file (optional quick upload, up to 3 total).",
    )
    image_2 = forms.FileField(
        required=False,
        label="Product Image 2",
        help_text="Second image file (optional quick upload).",
    )
    image_3 = forms.FileField(
        required=False,
        label="Product Image 3",
        help_text="Third image file (optional quick upload).",
    )

    class Meta:
        model = Product
        fields = [
            "name",
            "description",
            "category",
            "brand",
            "product_type",
            "sales_method",
            "publication_status",
            "price",
            "currency",
            "weight_kg",
            "is_featured",
            "featured_order",
            "image_1",
            "image_2",
            "image_3",
        ]

    def clean(self):
        cleaned_data = super().clean()
        quick_files = [f for key in ("image_1", "image_2", "image_3") if cleaned_data.get(key)]
        current_count = self.instance.images.count() if self.instance.pk else 0
        if current_count + len(quick_files) > 3:
            raise forms.ValidationError(
                f"A product can take up to 3 product images. This product already has {current_count} image(s), so you can add at most {max(0, 3 - current_count)} more."
            )
        return cleaned_data


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    form = ProductAdminForm
    list_display = [
        "primary_image_thumbnail",
        "name",
        "sku",
        "category",
        "brand",
        "product_type",
        "sales_method",
        "publication_status",
        "is_featured",
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
    inlines = [ProductImageInline, ProductSpecificationInline]

    fieldsets = (
        ("Basic Information", {
            "description": "SKU and slug are generated automatically when a product is created.",
            "fields": (
                "name",
                "description",
                "category",
                "brand",
                "product_type",
                "sales_method",
                "publication_status",
            )
        }),
        ("Pricing & Shipping", {
            "fields": (
                "price",
                "currency",
                "weight_kg",
                "is_featured",
                "featured_order",
            )
        }),
        ("Direct Image File Uploads (Up to 3 images total)", {
            "description": "Upload up to 3 product images directly from your computer. You can also review or edit uploaded images in the Product Images inline table below.",
            "fields": ("image_1", "image_2", "image_3"),
        }),
    )

    def primary_image_thumbnail(self, obj):
        primary = obj.images.filter(is_primary=True).first() or obj.images.first()
        if primary and primary.image_url:
            return mark_safe(
                f'<img src="{primary.image_url}" style="height: 36px; width: 36px; object-fit: cover; border-radius: 4px;" />'
            )
        return "-"
    primary_image_thumbnail.short_description = "Image"

    def save_formset(self, request, form, formset, change):
        if formset.model == ProductImage:
            for inline_form in formset.forms:
                if inline_form.cleaned_data.get("DELETE", False):
                    continue
                image_file = inline_form.cleaned_data.get("image_file")
                if image_file:
                    result = upload_media_file(image_file, folder="products", request=request)
                    inline_form.instance.image_url = result["url"]
        super().save_formset(request, form, formset, change)

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        product = form.instance
        quick_files = []
        for key in ("image_1", "image_2", "image_3"):
            f = form.cleaned_data.get(key)
            if f:
                quick_files.append(f)

        if quick_files:
            current_count = product.images.count()
            if current_count + len(quick_files) > 3:
                quick_files = quick_files[:max(0, 3 - current_count)]

            for i, upload_file in enumerate(quick_files):
                result = upload_media_file(upload_file, folder="products", request=request)
                order = current_count + i
                is_primary = (order == 0) and not product.images.filter(is_primary=True).exists()
                ProductImage.objects.create(
                    product=product,
                    image_url=result["url"],
                    alt_text=f"{product.name} {order + 1}",
                    display_order=order,
                    is_primary=is_primary,
                )


@admin.register(ProductSpecification)
class ProductSpecificationAdmin(admin.ModelAdmin):
    list_display = ["product", "name"]
    search_fields = ["product__name", "product__sku", "name", "value"]


# ==============================================================================
# Homepage Settings Admin
# ==============================================================================

class HomepageSettingsAdminForm(forms.ModelForm):
    hero_image_file = forms.FileField(
        required=False,
        label="Upload Hero Image File",
        help_text="Upload a hero image file (JPEG, PNG, WebP, GIF) up to 10 MB.",
    )

    class Meta:
        model = HomepageSettings
        exclude = ["hero_image_url"]


@admin.register(HomepageSettings)
class HomepageSettingsAdmin(admin.ModelAdmin):
    form = HomepageSettingsAdminForm
    list_display = ["hero_heading", "hero_thumbnail", "updated_at"]
    readonly_fields = ["current_hero_preview"]

    def hero_thumbnail(self, obj):
        if obj.hero_image_url:
            return mark_safe(
                f'<img src="{obj.hero_image_url}" style="height: 36px; width: 60px; object-fit: cover; border-radius: 4px;" />'
            )
        return "-"
    hero_thumbnail.short_description = "Hero"

    def current_hero_preview(self, obj):
        if obj and obj.hero_image_url:
            return mark_safe(
                f'<a href="{obj.hero_image_url}" target="_blank">'
                f'<img src="{obj.hero_image_url}" style="max-height: 140px; max-width: 250px; object-fit: contain; border-radius: 4px; border: 1px solid #ddd;" />'
                f'</a>'
            )
        return "No hero image uploaded yet"
    current_hero_preview.short_description = "Current Hero Image Preview"

    def save_model(self, request, obj, form, change):
        hero_image_file = form.cleaned_data.get("hero_image_file")
        if hero_image_file:
            result = upload_media_file(hero_image_file, folder="homepage", request=request)
            obj.hero_image_url = result["url"]
        super().save_model(request, obj, form, change)

    def has_add_permission(self, request):
        return not HomepageSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


# ==============================================================================
# Promotion Admin
# ==============================================================================

class PromotionAdminForm(forms.ModelForm):
    image_file = forms.FileField(
        required=False,
        label="Promotion Image File",
        help_text="Upload a promotion banner image file up to 10 MB.",
    )

    class Meta:
        model = Promotion
        fields = [
            "title",
            "slug",
            "description",
            "image_file",
            "image_alt",
            "cta_label",
            "cta_href",
            "starts_at",
            "ends_at",
            "is_active",
            "display_order",
        ]


@admin.register(Promotion)
class PromotionAdmin(admin.ModelAdmin):
    form = PromotionAdminForm
    list_display = ["image_thumbnail", "title", "slug", "is_active", "starts_at", "ends_at", "display_order"]
    list_filter = ["is_active"]
    search_fields = ["title", "slug", "description"]
    prepopulated_fields = {"slug": ("title",)}
    readonly_fields = ["current_image_preview"]
    fields = [
        "title",
        "slug",
        "description",
        "current_image_preview",
        "image_file",
        "image_alt",
        "cta_label",
        "cta_href",
        "starts_at",
        "ends_at",
        "is_active",
        "display_order",
    ]

    def image_thumbnail(self, obj):
        if obj.image_url:
            return mark_safe(
                f'<img src="{obj.image_url}" style="height: 36px; width: 60px; object-fit: cover; border-radius: 4px;" />'
            )
        return "-"
    image_thumbnail.short_description = "Image"

    def current_image_preview(self, obj):
        if obj and obj.image_url:
            return mark_safe(
                f'<a href="{obj.image_url}" target="_blank">'
                f'<img src="{obj.image_url}" style="max-height: 140px; max-width: 250px; object-fit: contain; border-radius: 4px; border: 1px solid #ddd;" />'
                f'</a>'
            )
        return "No image uploaded yet"
    current_image_preview.short_description = "Current Image Preview"

    def save_model(self, request, obj, form, change):
        image_file = form.cleaned_data.get("image_file")
        if image_file:
            result = upload_media_file(image_file, folder="promotions", request=request)
            obj.image_url = result["url"]
        super().save_model(request, obj, form, change)
