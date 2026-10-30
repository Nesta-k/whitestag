from rest_framework import serializers
from django.db import transaction
from django.utils import timezone

from .image_urls import public_image_url
from .media_service import upload_media_file, validate_image_file
from .models import (
    HOMEPAGE_SECTION_KEYS,
    Brand,
    Category,
    HomepageSettings,
    Product,
    ProductImage,
    ProductSpecification,
    Promotion,
)


class AbsoluteImageURLField(serializers.CharField):
    def to_representation(self, value):
        return public_image_url(self.context.get("request"), value)


class CategorySummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "product_type"]


class CategorySerializer(serializers.ModelSerializer):
    parent = CategorySummarySerializer(read_only=True)
    image_url = AbsoluteImageURLField(required=False, allow_blank=True)

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "product_type",
            "image_url",
            "is_featured",
            "featured_order",
            "parent",
        ]


class BrandSerializer(serializers.ModelSerializer):
    logo_url = AbsoluteImageURLField(required=False, allow_blank=True)

    class Meta:
        model = Brand
        fields = ["id", "name", "slug", "logo_url", "description"]


class ProductImageSerializer(serializers.ModelSerializer):
    image_url = AbsoluteImageURLField()

    class Meta:
        model = ProductImage
        fields = ["image_url", "alt_text", "display_order", "is_primary"]


class ProductSpecificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductSpecification
        fields = ["name", "value"]


class ProductSerializer(serializers.ModelSerializer):
    category = CategorySummarySerializer(read_only=True)
    brand = BrandSerializer(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    specifications = ProductSpecificationSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "sku",
            "name",
            "slug",
            "description",
            "category",
            "brand",
            "product_type",
            "sales_method",
            "price",
            "weight_kg",
            "currency",
            "is_featured",
            "featured_order",
            "images",
            "specifications",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AdminProductImageSerializer(serializers.ModelSerializer):
    image_url = AbsoluteImageURLField(required=False, allow_blank=True)
    file = serializers.FileField(required=False, write_only=True)

    class Meta:
        model = ProductImage
        fields = ["image_url", "file", "alt_text", "display_order", "is_primary"]


class AdminProductSpecificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductSpecification
        fields = ["name", "value"]


class AdminProductSerializer(serializers.ModelSerializer):
    category = CategorySummarySerializer(read_only=True)
    brand = BrandSerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category",
        queryset=Category.objects.all(),
        write_only=True,
    )
    brand_id = serializers.PrimaryKeyRelatedField(
        source="brand",
        queryset=Brand.objects.all(),
        write_only=True,
        allow_null=True,
        required=False,
    )
    product_type = serializers.CharField(required=False, allow_blank=True)
    images = AdminProductImageSerializer(many=True, required=False)
    specifications = AdminProductSpecificationSerializer(
        many=True,
        required=False,
    )

    class Meta:
        model = Product
        fields = [
            "id",
            "sku",
            "name",
            "slug",
            "description",
            "category",
            "category_id",
            "brand",
            "brand_id",
            "product_type",
            "sales_method",
            "publication_status",
            "price",
            "weight_kg",
            "currency",
            "is_featured",
            "featured_order",
            "images",
            "specifications",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "category", "brand", "created_at", "updated_at"]

    def validate(self, attrs):
        request = self.context.get("request")

        # 1. Check for directly uploaded files in request.FILES
        uploaded_files = []
        if request and hasattr(request, "FILES"):
            if "images" in request.FILES:
                uploaded_files.extend(request.FILES.getlist("images"))
            elif "image_files" in request.FILES:
                uploaded_files.extend(request.FILES.getlist("image_files"))
            elif "files" in request.FILES:
                uploaded_files.extend(request.FILES.getlist("files"))

            for key in ("image_1", "image_2", "image_3"):
                if key in request.FILES:
                    uploaded_files.append(request.FILES[key])

        if uploaded_files:
            if len(uploaded_files) > 3:
                raise serializers.ValidationError(
                    {"images": "A product can take up to 3 product images."}
                )
            new_images = []
            for i, f in enumerate(uploaded_files):
                validate_image_file(f)
                upload_res = upload_media_file(f, folder="products", request=request)
                new_images.append(
                    {
                        "image_url": upload_res["url"],
                        "alt_text": attrs.get("name") or getattr(self.instance, "name", "Product image"),
                        "display_order": i,
                        "is_primary": (i == 0),
                    }
                )
            attrs["images"] = new_images

        # 2. Check and validate images list (whether from upload or input)
        images = attrs.get("images")
        if images is not None:
            if len(images) > 3:
                raise serializers.ValidationError(
                    {"images": "A product can take up to 3 product images."}
                )

            # Process any file objects passed inside images list
            for i, img in enumerate(images):
                f = img.pop("file", None)
                if f:
                    validate_image_file(f)
                    upload_res = upload_media_file(f, folder="products", request=request)
                    img["image_url"] = upload_res["url"]
                if not img.get("image_url"):
                    raise serializers.ValidationError(
                        {"images": f"Image {i + 1} requires an image file or URL."}
                    )

            orders = [image.get("display_order", 0) for image in images]
            if len(orders) != len(set(orders)):
                raise serializers.ValidationError(
                    {"images": "Image display orders must be unique."}
                )
            if sum(bool(image.get("is_primary")) for image in images) > 1:
                raise serializers.ValidationError(
                    {"images": "A product can have only one primary image."}
                )

        specifications = attrs.get("specifications")
        if specifications is not None:
            names = [item["name"].strip().casefold() for item in specifications]
            if len(names) != len(set(names)):
                raise serializers.ValidationError(
                    {"specifications": "Specification names must be unique."}
                )

        category = attrs.get("category")
        if category is None and "category_id" in attrs:
            category = attrs["category_id"]
        if category is None and self.instance:
            category = getattr(self.instance, "category", None)

        product_type = attrs.get(
            "product_type",
            getattr(self.instance, "product_type", None),
        )
        if not product_type and category is not None:
            product_type = getattr(category, "product_type", Product.ProductType.SPARE_PART)
            attrs["product_type"] = product_type

        publication_status = attrs.get(
            "publication_status",
            getattr(self.instance, "publication_status", None),
        )
        price = attrs.get("price", getattr(self.instance, "price", None))
        sales_method = attrs.get(
            "sales_method",
            getattr(self.instance, "sales_method", None),
        )
        currency = attrs.get("currency", getattr(self.instance, "currency", "GHS"))
        if (
            publication_status == Product.PublicationStatus.PUBLISHED
            and product_type == Product.ProductType.SPARE_PART
            and sales_method == Product.SalesMethod.DIRECT_PURCHASE
            and (price is None or price <= 0 or currency != "GHS")
        ):
            raise serializers.ValidationError(
                {
                    "price": (
                        "Published direct-purchase spare parts need a positive "
                        "GHS price."
                    )
                }
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        images = validated_data.pop("images", [])
        specifications = validated_data.pop("specifications", [])
        product = Product.objects.create(**validated_data)

        # Enforce maximum 3 images
        images = images[:3]
        if images and not any(img.get("is_primary") for img in images):
            images[0]["is_primary"] = True

        ProductImage.objects.bulk_create(
            [ProductImage(product=product, **image) for image in images]
        )
        ProductSpecification.objects.bulk_create(
            [
                ProductSpecification(product=product, **specification)
                for specification in specifications
            ]
        )
        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        images = validated_data.pop("images", None)
        specifications = validated_data.pop("specifications", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if images is not None:
            images = images[:3]
            if images and not any(img.get("is_primary") for img in images):
                images[0]["is_primary"] = True
            instance.images.all().delete()
            ProductImage.objects.bulk_create(
                [ProductImage(product=instance, **image) for image in images]
            )
        if specifications is not None:
            instance.specifications.all().delete()
            ProductSpecification.objects.bulk_create(
                [
                    ProductSpecification(product=instance, **specification)
                    for specification in specifications
                ]
            )
        return instance


class AdminCategorySerializer(serializers.ModelSerializer):
    parent = CategorySummarySerializer(read_only=True)
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent",
        queryset=Category.objects.all(),
        required=False,
        allow_null=True,
    )
    image_url = AbsoluteImageURLField(required=False, allow_blank=True)
    image_file = serializers.FileField(required=False, write_only=True)
    image = serializers.FileField(required=False, write_only=True)

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "product_type",
            "image_url",
            "image_file",
            "image",
            "is_featured",
            "featured_order",
            "parent",
            "parent_id",
        ]
        read_only_fields = ["id", "parent"]

    def validate_parent_id(self, parent):
        if self.instance and parent and parent.pk == self.instance.pk:
            raise serializers.ValidationError("A category cannot be its own parent.")
        return parent

    def validate(self, attrs):
        request = self.context.get("request")
        file = attrs.pop("image_file", None) or attrs.pop("image", None)
        if not file and request and hasattr(request, "FILES"):
            file = request.FILES.get("image_file") or request.FILES.get("image")
        if file:
            validate_image_file(file)
            result = upload_media_file(file, folder="categories", request=request)
            attrs["image_url"] = result["url"]
        return super().validate(attrs)


class AdminBrandSerializer(serializers.ModelSerializer):
    logo_url = AbsoluteImageURLField(required=False, allow_blank=True)
    logo_file = serializers.FileField(required=False, write_only=True)
    logo = serializers.FileField(required=False, write_only=True)

    class Meta:
        model = Brand
        fields = ["id", "name", "slug", "logo_url", "logo_file", "logo", "description"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        request = self.context.get("request")
        file = attrs.pop("logo_file", None) or attrs.pop("logo", None)
        if not file and request and hasattr(request, "FILES"):
            file = request.FILES.get("logo_file") or request.FILES.get("logo")
        if file:
            validate_image_file(file)
            result = upload_media_file(file, folder="brands", request=request)
            attrs["logo_url"] = result["url"]
        return super().validate(attrs)


class PromotionSerializer(serializers.ModelSerializer):
    image_url = AbsoluteImageURLField(required=False, allow_blank=True)
    image_file = serializers.FileField(required=False, write_only=True)
    image = serializers.FileField(required=False, write_only=True)

    class Meta:
        model = Promotion
        fields = [
            "id",
            "title",
            "slug",
            "description",
            "image_url",
            "image_file",
            "image",
            "image_alt",
            "cta_label",
            "cta_href",
            "starts_at",
            "ends_at",
            "is_active",
            "display_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        file = attrs.pop("image_file", None) or attrs.pop("image", None)
        if not file and request and hasattr(request, "FILES"):
            file = request.FILES.get("image_file") or request.FILES.get("image")
        if file:
            validate_image_file(file)
            result = upload_media_file(file, folder="promotions", request=request)
            attrs["image_url"] = result["url"]

        starts_at = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends_at = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts_at and ends_at and ends_at < starts_at:
            raise serializers.ValidationError(
                {"ends_at": "The end time must be on or after the start time."}
            )
        return attrs


class HomepageSettingsSerializer(serializers.ModelSerializer):
    hero_image_url = AbsoluteImageURLField(required=False, allow_blank=True)
    hero_image_file = serializers.FileField(required=False, write_only=True)
    hero_image = serializers.FileField(required=False, write_only=True)

    class Meta:
        model = HomepageSettings
        fields = [
            "hero_kicker",
            "hero_heading",
            "hero_subtitle",
            "hero_description",
            "hero_image_url",
            "hero_image_file",
            "hero_image",
            "hero_image_alt",
            "hero_primary_cta_label",
            "hero_primary_cta_href",
            "hero_secondary_cta_label",
            "hero_secondary_cta_href",
            "categories_eyebrow",
            "categories_heading",
            "promotions_eyebrow",
            "promotions_heading",
            "featured_products_eyebrow",
            "featured_products_heading",
            "brands_eyebrow",
            "brands_heading",
            "preorders_eyebrow",
            "preorders_heading",
            "preorders_body",
            "vehicles_eyebrow",
            "vehicles_heading",
            "vehicles_body",
            "how_it_works_eyebrow",
            "how_it_works_heading",
            "support_eyebrow",
            "support_heading",
            "support_body",
            "show_hero",
            "show_categories",
            "show_promotions",
            "show_featured_products",
            "show_brands",
            "show_preorders",
            "show_vehicles",
            "show_how_it_works",
            "show_support",
            "section_order",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        file = attrs.pop("hero_image_file", None) or attrs.pop("hero_image", None)
        if not file and request and hasattr(request, "FILES"):
            file = request.FILES.get("hero_image_file") or request.FILES.get("hero_image")
        if file:
            validate_image_file(file)
            result = upload_media_file(file, folder="homepage", request=request)
            attrs["hero_image_url"] = result["url"]
        return super().validate(attrs)

    def validate_section_order(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError(
                "Provide an ordered list of homepage section keys."
            )
        unknown = [item for item in value if item not in HOMEPAGE_SECTION_KEYS]
        if unknown:
            raise serializers.ValidationError(
                f"Unknown homepage sections: {', '.join(map(str, unknown))}."
            )
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Section keys must be unique.")
        return value


def active_promotion_queryset():
    now = timezone.now()
    return (
        Promotion.objects.filter(is_active=True)
        .exclude(starts_at__gt=now)
        .exclude(ends_at__lt=now)
    )
