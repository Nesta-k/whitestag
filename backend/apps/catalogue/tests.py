from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from .models import (
    Brand,
    Category,
    Product,
    ProductImage,
    ProductSpecification,
)


class CatalogueApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.parent_category = Category.objects.create(
            name="Mobility parts",
            slug="mobility-parts",
        )
        self.parts_category = Category.objects.create(
            name="Spare parts",
            slug="spare-parts",
            parent=self.parent_category,
        )
        self.vehicle_category = Category.objects.create(
            name="Vehicles",
            slug="vehicles",
        )
        self.brand = Brand.objects.create(name="Acme Motors", slug="acme-motors")
        self.hidden_brand = Brand.objects.create(
            name="Unpublished Brand",
            slug="unpublished-brand",
        )
        self.part = Product.objects.create(
            sku="PART-001",
            name="Brake pad set",
            slug="brake-pad-set",
            description="Front brake pads.",
            category=self.parts_category,
            brand=self.brand,
            product_type=Product.ProductType.SPARE_PART,
            sales_method=Product.SalesMethod.DIRECT_PURCHASE,
            publication_status=Product.PublicationStatus.PUBLISHED,
            price=Decimal("42.50"),
        )
        self.vehicle = Product.objects.create(
            sku="CAR-001",
            name="Electric vehicle",
            slug="electric-vehicle",
            category=self.vehicle_category,
            brand=self.brand,
            product_type=Product.ProductType.ELECTRIC_VEHICLE,
            sales_method=Product.SalesMethod.QUOTATION,
            publication_status=Product.PublicationStatus.PUBLISHED,
        )
        Product.objects.create(
            sku="DRAFT-001",
            name="Draft part",
            slug="draft-part",
            category=self.parts_category,
            brand=self.hidden_brand,
            product_type=Product.ProductType.SPARE_PART,
            sales_method=Product.SalesMethod.DIRECT_PURCHASE,
            publication_status=Product.PublicationStatus.DRAFT,
            price=Decimal("10.00"),
        )
        Product.objects.create(
            sku="ARCHIVE-001",
            name="Archived car",
            slug="archived-car",
            category=self.vehicle_category,
            product_type=Product.ProductType.CAR,
            sales_method=Product.SalesMethod.QUOTATION,
            publication_status=Product.PublicationStatus.ARCHIVED,
        )
        for index in range(22):
            Product.objects.create(
                sku=f"OTHER-{index:03d}",
                name=f"Related product {index:03d}",
                slug=f"related-product-{index:03d}",
                category=self.parts_category,
                product_type=Product.ProductType.OTHER,
                sales_method=Product.SalesMethod.DIRECT_PURCHASE,
                publication_status=Product.PublicationStatus.PUBLISHED,
                price=Decimal("1.00"),
            )
        ProductImage.objects.create(
            product=self.part,
            image_url="https://images.example.test/brake-pad.jpg",
            alt_text="Brake pad set",
            display_order=0,
            is_primary=True,
        )
        ProductSpecification.objects.create(
            product=self.part,
            name="Position",
            value="Front",
        )

    def test_categories_are_retrievable_with_parent_summary(self):
        response = self.client.get(reverse("api:catalogue:category-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 3)
        parts = next(
            category
            for category in response.data["results"]
            if category["slug"] == "spare-parts"
        )
        self.assertEqual(parts["parent"]["slug"], "mobility-parts")

    def test_brands_only_include_brands_used_by_published_products(self):
        response = self.client.get(reverse("api:catalogue:brand-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [brand["slug"] for brand in response.data["results"]],
            ["acme-motors"],
        )

    def test_product_list_excludes_drafts_and_archived_products(self):
        response = self.client.get(reverse("api:catalogue:product-list"))
        slugs = [product["slug"] for product in response.data["results"]]

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 24)
        self.assertIn(self.part.slug, slugs)
        self.assertNotIn("draft-part", slugs)
        self.assertNotIn("archived-car", slugs)

    def test_product_filters_can_be_combined(self):
        response = self.client.get(
            reverse("api:catalogue:product-list"),
            {
                "category": "spare-parts",
                "brand": "acme-motors",
                "product_type": Product.ProductType.SPARE_PART,
                "sales_method": Product.SalesMethod.DIRECT_PURCHASE,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["slug"], self.part.slug)

    def test_product_list_is_paginated(self):
        response = self.client.get(
            reverse("api:catalogue:product-list"),
            {"page_size": 5, "page": 2},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 24)
        self.assertEqual(len(response.data["results"]), 5)
        self.assertIsNotNone(response.data["previous"])
        self.assertIsNotNone(response.data["next"])

    def test_product_detail_contains_public_catalogue_data_only(self):
        response = self.client.get(
            reverse("api:catalogue:product-detail", args=[self.part.slug])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["price"], "42.50")
        self.assertIsNone(response.data["weight_kg"])
        self.assertEqual(response.data["currency"], "GHS")
        self.assertEqual(response.data["images"][0]["alt_text"], "Brake pad set")
        self.assertEqual(
            response.data["specifications"],
            [{"name": "Position", "value": "Front"}],
        )
        for private_field in (
            "publication_status",
            "cost_price",
            "supplier",
            "supplier_data",
        ):
            self.assertNotIn(private_field, response.data)

    def test_product_detail_does_not_expose_unpublished_products(self):
        response = self.client.get(
            reverse("api:catalogue:product-detail", args=["draft-part"])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_missing_product_slug_returns_not_found(self):
        response = self.client.get(
            reverse("api:catalogue:product-detail", args=["does-not-exist"])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
