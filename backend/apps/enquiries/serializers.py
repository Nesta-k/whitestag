from rest_framework import serializers
from .models import VehicleEnquiry
from apps.catalogue.models import Product
from apps.customers.models import CustomerAccount

class ProductSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "sku", "name", "slug"]

class CustomerSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerAccount
        fields = ["id", "email"]

class VehicleEnquiryPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleEnquiry
        fields = [
            "id",
            "product",
            "customer",
            "name",
            "email",
            "phone_number",
            "message",
            "created_at",
        ]
        read_only_fields = ["id", "customer", "created_at"]

    def validate_product(self, product):
        if product.publication_status != Product.PublicationStatus.PUBLISHED:
            raise serializers.ValidationError(
                "This listing is not available for enquiry."
            )
        return product

class VehicleEnquiryStaffSerializer(serializers.ModelSerializer):
    product = ProductSummarySerializer(read_only=True)
    customer = CustomerSummarySerializer(read_only=True)

    class Meta:
        model = VehicleEnquiry
        fields = "__all__"
        read_only_fields = ["id", "created_at", "updated_at"]
