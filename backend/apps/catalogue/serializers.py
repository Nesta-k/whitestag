from rest_framework import serializers

from .models import Brand, Category, Product, ProductImage, ProductSpecification


class CategorySummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class CategorySerializer(serializers.ModelSerializer):
    parent = CategorySummarySerializer(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "parent"]


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ["id", "name", "slug", "description"]


class ProductImageSerializer(serializers.ModelSerializer):
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
            "images",
            "specifications",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
