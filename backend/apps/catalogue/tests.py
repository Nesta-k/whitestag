from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.inventory.models import InventoryRecord, StockMovement

from .models import (
    Brand,
    Category,
    HomepageSettings,
    Product,
    ProductImage,
    ProductSpecification,
    Promotion,
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

    def test_staff_catalogue_api_requires_staff_and_manages_products(self):
        url = reverse("api:catalogue:staff-product-list")
        denied = self.client.get(url)
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        customer = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="catalogue-customer@example.com",
            password="Customer-Password-82!",
        )
        self.client.force_authenticate(user=customer)
        customer_denied = self.client.get(url)
        self.assertEqual(customer_denied.status_code, status.HTTP_403_FORBIDDEN)

        staff = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="catalogue-staff@example.com",
            password="Staff-Password-82!",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff)
        response = self.client.post(
            url,
            {
                "sku": "ADMIN-001",
                "name": "Admin-created part",
                "slug": "admin-created-part",
                "description": "Created using the staff catalogue API.",
                "category_id": self.parts_category.pk,
                "brand_id": self.brand.pk,
                "product_type": Product.ProductType.SPARE_PART,
                "sales_method": Product.SalesMethod.DIRECT_PURCHASE,
                "publication_status": Product.PublicationStatus.PUBLISHED,
                "price": "17.50",
                "weight_kg": "1.250",
                "currency": "GHS",
                "images": [
                    {
                        "image_url": "https://images.example.test/admin-part.jpg",
                        "alt_text": "Admin part",
                        "display_order": 0,
                        "is_primary": True,
                    }
                ],
                "specifications": [{"name": "Fitment", "value": "Front"}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        product = Product.objects.get(sku="ADMIN-001")
        self.assertEqual(product.publication_status, "published")
        self.assertEqual(product.images.count(), 1)
        self.assertEqual(product.specifications.count(), 1)

        update = self.client.patch(
            reverse("api:catalogue:staff-product-detail", args=[product.pk]),
            {"publication_status": Product.PublicationStatus.ARCHIVED},
            format="json",
        )
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        product.refresh_from_db()
        self.assertEqual(product.publication_status, "archived")

    def test_staff_product_api_generates_sku_when_omitted(self):
        staff = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="sku-generation-staff@example.com",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff)

        response = self.client.post(
            reverse("api:catalogue:staff-product-list"),
            {
                "name": "Automatically numbered part",
                "category_id": self.parts_category.pk,
                "sales_method": Product.SalesMethod.DIRECT_PURCHASE,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertRegex(response.data["sku"], r"^WS-[A-F0-9]{32}$")
        self.assertEqual(response.data["slug"], "automatically-numbered-part")
        product = Product.objects.get(slug="automatically-numbered-part")
        self.assertEqual(product.sku, response.data["sku"])
        self.assertEqual(
            InventoryRecord.objects.get(product=product).available_quantity,
            0,
        )

        duplicate_name_response = self.client.post(
            reverse("api:catalogue:staff-product-list"),
            {
                "name": "Automatically numbered part",
                "category_id": self.parts_category.pk,
                "sales_method": Product.SalesMethod.DIRECT_PURCHASE,
            },
            format="json",
        )
        self.assertEqual(
            duplicate_name_response.status_code,
            status.HTTP_201_CREATED,
        )
        self.assertEqual(
            duplicate_name_response.data["slug"],
            "automatically-numbered-part-2",
        )

    def test_staff_product_creation_records_initial_stock(self):
        staff = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="initial-stock-staff@example.com",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff)

        response = self.client.post(
            reverse("api:catalogue:staff-product-list"),
            {
                "name": "Product with initial stock",
                "category_id": self.parts_category.pk,
                "sales_method": Product.SalesMethod.DIRECT_PURCHASE,
                "initial_stock_quantity": 6,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        product = Product.objects.get(pk=response.data["id"])
        inventory = InventoryRecord.objects.get(product=product)
        self.assertEqual(inventory.available_quantity, 6)
        movement = StockMovement.objects.get(inventory_record=inventory)
        self.assertEqual(movement.movement_type, StockMovement.MovementType.RECEIPT)
        self.assertEqual(movement.quantity, 6)
        self.assertEqual(movement.created_by, staff)

    def test_staff_product_api_rejects_unpriced_direct_purchase_publication(self):
        staff = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="publishing-staff@example.com",
            password="Staff-Password-82!",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff)

        response = self.client.post(
            reverse("api:catalogue:staff-product-list"),
            {
                "sku": "ADMIN-UNPRICED",
                "name": "Unpriced part",
                "slug": "admin-unpriced-part",
                "category_id": self.parts_category.pk,
                "product_type": Product.ProductType.SPARE_PART,
                "sales_method": Product.SalesMethod.DIRECT_PURCHASE,
                "publication_status": Product.PublicationStatus.PUBLISHED,
                "price": None,
                "currency": "GHS",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Product.objects.filter(sku="ADMIN-UNPRICED").exists())

        vehicle_response = self.client.post(
            reverse("api:catalogue:staff-product-list"),
            {
                "sku": "ADMIN-UNPRICED-VEHICLE",
                "name": "Unpriced direct-purchase vehicle",
                "slug": "admin-unpriced-direct-purchase-vehicle",
                "category_id": self.vehicle_category.pk,
                "product_type": Product.ProductType.CAR,
                "sales_method": Product.SalesMethod.DIRECT_PURCHASE,
                "publication_status": Product.PublicationStatus.PUBLISHED,
                "price": None,
                "currency": "GHS",
            },
            format="json",
        )
        self.assertEqual(vehicle_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            Product.objects.filter(sku="ADMIN-UNPRICED-VEHICLE").exists()
        )

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

    def test_public_homepage_uses_published_featured_content(self):
        self.part.is_featured = True
        self.part.save(update_fields=["is_featured"])
        self.parts_category.is_featured = True
        self.parts_category.save(update_fields=["is_featured"])
        draft = Product.objects.get(slug="draft-part")
        draft.is_featured = True
        draft.save(update_fields=["is_featured"])
        Promotion.objects.create(
            title="Live offer",
            slug="live-offer",
            description="A published promotion.",
            is_active=True,
            display_order=1,
        )
        Promotion.objects.create(
            title="Hidden offer",
            slug="hidden-offer",
            is_active=False,
        )
        Promotion.objects.create(
            title="Expired offer",
            slug="expired-offer",
            is_active=True,
            starts_at=timezone.now() - timedelta(days=10),
            ends_at=timezone.now() - timedelta(days=1),
        )
        HomepageSettings.objects.create(
            pk=1,
            hero_heading="CMS heading from staff",
            show_preorders=False,
        )

        response = self.client.get(reverse("api:catalogue:homepage"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["settings"]["hero_heading"], "CMS heading from staff")
        self.assertFalse(response.data["settings"]["show_preorders"])
        product_slugs = [item["slug"] for item in response.data["featured_products"]]
        self.assertIn(self.part.slug, product_slugs)
        self.assertNotIn("draft-part", product_slugs)
        category_slugs = [item["slug"] for item in response.data["featured_categories"]]
        self.assertEqual(category_slugs, ["spare-parts"])
        promotion_slugs = [item["slug"] for item in response.data["promotions"]]
        self.assertEqual(promotion_slugs, ["live-offer"])

    def test_staff_homepage_and_promotions_require_staff(self):
        homepage_url = reverse("api:catalogue:staff-homepage")
        promotion_url = reverse("api:catalogue:staff-promotion-list")
        self.assertEqual(self.client.get(homepage_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(promotion_url).status_code, status.HTTP_403_FORBIDDEN)

        staff = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="content-staff@example.com",
            password="Staff-Password-82!",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff)
        homepage = self.client.patch(
            homepage_url,
            {"hero_heading": "Updated from CMS", "show_brands": False},
            format="json",
        )
        self.assertEqual(homepage.status_code, status.HTTP_200_OK)
        self.assertEqual(homepage.data["hero_heading"], "Updated from CMS")
        self.assertFalse(homepage.data["show_brands"])

        created = self.client.post(
            promotion_url,
            {
                "title": "Staff offer",
                "slug": "staff-offer",
                "description": "Created in CMS",
                "is_active": True,
                "display_order": 2,
                "cta_label": "Shop now",
                "cta_href": "/products",
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        public = self.client.get(reverse("api:catalogue:promotion-list"))
        self.assertEqual(public.status_code, status.HTTP_200_OK)
        self.assertEqual(public.data["results"][0]["slug"], "staff-offer")

        archived = self.client.patch(
            reverse("api:catalogue:staff-product-detail", args=[self.part.pk]),
            {"publication_status": Product.PublicationStatus.ARCHIVED},
            format="json",
        )
        self.assertEqual(archived.status_code, status.HTTP_200_OK)
        public_detail = self.client.get(
            reverse("api:catalogue:product-detail", args=[self.part.slug])
        )
        self.assertEqual(public_detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_staff_media_upload_returns_usable_image_url(self):
        url = reverse("api:catalogue:staff-media-upload")
        png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00"
            b"\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05"
            b"\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        denied = self.client.post(
            url,
            {"file": SimpleUploadedFile("part.png", png, content_type="image/png")},
            format="multipart",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        staff = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="media-staff@example.com",
            password="Staff-Password-82!",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff)
        with override_settings(MEDIA_ROOT=self._media_root()):
            with patch("apps.catalogue.media_service.is_cloudinary_configured", return_value=False):
                response = self.client.post(
                    url,
                    {"file": SimpleUploadedFile("part.png", png, content_type="image/png")},
                    format="multipart",
                )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["url"].startswith("http"))
        self.assertIn("/media/", response.data["url"])

    def _media_root(self):
        from pathlib import Path
        from tempfile import mkdtemp

        return Path(mkdtemp())

    def test_relative_product_image_urls_are_absolutized(self):
        ProductImage.objects.filter(product=self.part).delete()
        ProductImage.objects.create(
            product=self.part,
            image_url="/media/catalogue/brake-pad.jpg",
            alt_text="Stored media path",
            display_order=0,
            is_primary=True,
        )
        response = self.client.get(
            reverse("api:catalogue:product-detail", args=[self.part.slug])
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            response.data["images"][0]["image_url"].endswith(
                "/media/catalogue/brake-pad.jpg"
            )
        )
        self.assertTrue(response.data["images"][0]["image_url"].startswith("http"))

    def test_staff_category_update_keeps_parent_and_featured_state(self):
        staff = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="category-staff@example.com",
            password="Staff-Password-82!",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff)
        response = self.client.patch(
            reverse("api:catalogue:staff-category-detail", args=[self.parts_category.pk]),
            {
                "description": "Updated from CMS",
                "parent_id": self.parent_category.pk,
                "is_featured": True,
                "featured_order": 3,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.parts_category.refresh_from_db()
        self.assertEqual(self.parts_category.parent_id, self.parent_category.pk)
        self.assertTrue(self.parts_category.is_featured)
        self.assertEqual(self.parts_category.featured_order, 3)


class MediaUploadApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff_user = get_user_model().objects.create_user(
            username="media-staff",
            email="media-staff@example.com",
            password="Staff-Password-99!",
            is_staff=True,
        )
        self.upload_url = reverse("api:catalogue:staff-media-upload")

    def test_media_upload_requires_staff(self):
        # Anonymous
        file = SimpleUploadedFile("part.jpg", b"fake image bytes", content_type="image/jpeg")
        res_anon = self.client.post(self.upload_url, {"file": file}, format="multipart")
        self.assertIn(
            res_anon.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

        # Customer
        customer = get_user_model().objects.create_user(
            username="regular-buyer",
            email="buyer@example.com",
            password="Customer-Password-99!",
        )
        self.client.force_authenticate(user=customer)
        res_cust = self.client.post(self.upload_url, {"file": file}, format="multipart")
        self.assertEqual(res_cust.status_code, status.HTTP_403_FORBIDDEN)

    def test_media_upload_validates_required_file_and_content_type(self):
        self.client.force_authenticate(user=self.staff_user)

        # Missing file
        res_empty = self.client.post(self.upload_url, {}, format="multipart")
        self.assertEqual(res_empty.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", res_empty.data)

        # Unsupported content type
        txt_file = SimpleUploadedFile("readme.txt", b"plain text", content_type="text/plain")
        res_txt = self.client.post(self.upload_url, {"file": txt_file}, format="multipart")
        self.assertEqual(res_txt.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", res_txt.data)

    @patch("apps.catalogue.media_service.is_cloudinary_configured", return_value=False)
    def test_media_upload_local_fallback(self, _mock_cloudinary):
        self.client.force_authenticate(user=self.staff_user)
        img = SimpleUploadedFile("engine.jpg", b"\xff\xd8\xff\xe0fakejpeg", content_type="image/jpeg")

        response = self.client.post(self.upload_url, {"file": img}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("url", response.data)
        self.assertTrue(response.data["url"].startswith("http"))
        self.assertTrue(response.data["url"].endswith(".jpg"))
        self.assertEqual(response.data["storage"], "local")


    @override_settings(CLOUDINARY_URL="cloudinary://123456:secret@testcloud")
    @patch("cloudinary.uploader.upload")
    def test_media_upload_cloudinary_integration(self, mock_upload):
        mock_upload.return_value = {
            "secure_url": "https://res.cloudinary.com/testcloud/image/upload/v1234/whitestag/catalogue/brake-pad.webp",
            "public_id": "whitestag/catalogue/brake-pad",
            "width": 800,
            "height": 600,
            "format": "webp",
            "bytes": 45200,
        }
        self.client.force_authenticate(user=self.staff_user)
        img = SimpleUploadedFile("brake-pad.png", b"fakepngbytes", content_type="image/png")

        response = self.client.post(
            self.upload_url,
            {"file": img, "folder": "products"},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_upload.assert_called_once()
        call_kwargs = mock_upload.call_args.kwargs
        self.assertEqual(call_kwargs["folder"], "whitestag/products")
        self.assertEqual(call_kwargs["quality"], "auto")
        self.assertEqual(call_kwargs["fetch_format"], "auto")

        self.assertEqual(
            response.data["url"],
            "https://res.cloudinary.com/testcloud/image/upload/v1234/whitestag/catalogue/brake-pad.webp",
        )
        self.assertEqual(response.data["storage"], "cloudinary")
        self.assertEqual(response.data["public_id"], "whitestag/catalogue/brake-pad")

    @patch("apps.catalogue.media_service.is_cloudinary_configured", return_value=False)
    def test_media_batch_upload(self, _mock_cloudinary):
        self.client.force_authenticate(user=self.staff_user)
        file1 = SimpleUploadedFile("front.jpg", b"fakeimg1", content_type="image/jpeg")
        file2 = SimpleUploadedFile("back.png", b"fakeimg2", content_type="image/png")

        response = self.client.post(
            self.upload_url,
            {"files": [file1, file2]},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["images"]), 2)
        self.assertTrue(response.data["images"][0]["url"].endswith(".jpg"))
        self.assertTrue(response.data["images"][1]["url"].endswith(".png"))


class CategoryProductTypeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff_user = get_user_model().objects.create_user(
            username="catalogue-admin",
            email="catadmin@example.com",
            password="Admin-Password-123!",
            is_staff=True,
        )
        self.car_category = Category.objects.create(
            name="Sedans & SUVs",
            slug="sedans-suvs",
            product_type=Product.ProductType.CAR,
        )
        self.ev_category = Category.objects.create(
            name="Electric Cars",
            slug="electric-cars",
            product_type=Product.ProductType.ELECTRIC_VEHICLE,
        )
        self.parts_category = Category.objects.create(
            name="Engine Components",
            slug="engine-components",
            product_type=Product.ProductType.SPARE_PART,
        )
        self.trike_category = Category.objects.create(
            name="Commercial Tricycles",
            slug="commercial-tricycles",
            product_type=Product.ProductType.TRICYCLE,
        )

    def test_category_list_filter_by_product_type(self):
        url = reverse("api:catalogue:category-list")
        res = self.client.get(url, {"product_type": Product.ProductType.CAR})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        slugs = [c["slug"] for c in res.data["results"]]
        self.assertEqual(slugs, ["sedans-suvs"])
        self.assertEqual(res.data["results"][0]["product_type"], Product.ProductType.CAR)

        # Filter by electric_vehicle
        res_ev = self.client.get(url, {"product_type": Product.ProductType.ELECTRIC_VEHICLE})
        self.assertEqual(res_ev.status_code, status.HTTP_200_OK)
        slugs_ev = [c["slug"] for c in res_ev.data["results"]]
        self.assertEqual(slugs_ev, ["electric-cars"])

    def test_staff_create_category_with_product_type(self):
        self.client.force_authenticate(user=self.staff_user)
        url = reverse("api:catalogue:staff-category-list")
        payload = {
            "name": "E-Bikes and Scooters",
            "slug": "e-bikes-scooters",
            "product_type": Product.ProductType.MOTORCYCLE_BIKE,
            "description": "Two-wheeler e-mobility",
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["product_type"], Product.ProductType.MOTORCYCLE_BIKE)

        created = Category.objects.get(slug="e-bikes-scooters")
        self.assertEqual(created.product_type, Product.ProductType.MOTORCYCLE_BIKE)

    def test_staff_category_filter_by_product_type(self):
        self.client.force_authenticate(user=self.staff_user)
        url = reverse("api:catalogue:staff-category-list")
        res = self.client.get(url, {"product_type": Product.ProductType.TRICYCLE})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["slug"], "commercial-tricycles")

    def test_product_auto_inherits_category_product_type_when_omitted(self):
        product = Product.objects.create(
            sku="AUTO-TYPE-001",
            name="Standard Tricycle",
            slug="standard-tricycle",
            category=self.trike_category,
            sales_method=Product.SalesMethod.QUOTATION,
            publication_status=Product.PublicationStatus.PUBLISHED,
        )
        self.assertEqual(product.product_type, Product.ProductType.TRICYCLE)

    def test_product_explicit_product_type_overrides_category_product_type(self):
        product = Product.objects.create(
            sku="OVERRIDE-001",
            name="EV Diagnostic Tool",
            slug="ev-diagnostic-tool",
            category=self.ev_category,
            product_type=Product.ProductType.SPARE_PART,
            sales_method=Product.SalesMethod.DIRECT_PURCHASE,
            publication_status=Product.PublicationStatus.PUBLISHED,
            price=Decimal("150.00"),
        )
        self.assertEqual(product.product_type, Product.ProductType.SPARE_PART)

    def test_staff_product_api_auto_inherits_product_type_from_category(self):
        self.client.force_authenticate(user=self.staff_user)
        url = reverse("api:catalogue:staff-product-list")
        payload = {
            "sku": "API-INHERIT-001",
            "name": "Luxury Sedan",
            "slug": "luxury-sedan",
            "category_id": self.car_category.pk,
            "sales_method": Product.SalesMethod.QUOTATION,
            "publication_status": Product.PublicationStatus.PUBLISHED,
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["product_type"], Product.ProductType.CAR)

        product = Product.objects.get(sku="API-INHERIT-001")
        self.assertEqual(product.product_type, Product.ProductType.CAR)


class ProductImageLimitAndFileUploadTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff_user = get_user_model().objects.create_user(
            username="image-admin",
            email="imageadmin@example.com",
            password="Admin-Password-123!",
            is_staff=True,
        )
        self.category = Category.objects.create(
            name="Suspension Parts",
            slug="suspension-parts",
            product_type=Product.ProductType.SPARE_PART,
        )
        self.brand = Brand.objects.create(
            name="Koni",
            slug="koni",
        )

    def test_product_can_take_up_to_3_images(self):
        self.client.force_authenticate(user=self.staff_user)
        url = reverse("api:catalogue:staff-product-list")
        payload = {
            "sku": "SHOCK-001",
            "name": "Heavy Duty Shock Absorber",
            "slug": "heavy-duty-shock-absorber",
            "category_id": self.category.pk,
            "brand_id": self.brand.pk,
            "sales_method": Product.SalesMethod.DIRECT_PURCHASE,
            "publication_status": Product.PublicationStatus.PUBLISHED,
            "price": "250.00",
            "currency": "GHS",
            "images": [
                {"image_url": "https://images.example.test/shock1.jpg", "alt_text": "Front view", "display_order": 0, "is_primary": True},
                {"image_url": "https://images.example.test/shock2.jpg", "alt_text": "Side view", "display_order": 1, "is_primary": False},
                {"image_url": "https://images.example.test/shock3.jpg", "alt_text": "Mounting bracket", "display_order": 2, "is_primary": False},
            ],
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(res.data["images"]), 3)
        product = Product.objects.get(sku="SHOCK-001")
        self.assertEqual(product.images.count(), 3)

    def test_product_rejects_more_than_3_images(self):
        self.client.force_authenticate(user=self.staff_user)
        url = reverse("api:catalogue:staff-product-list")
        payload = {
            "sku": "SHOCK-002",
            "name": "Shock Absorber Extra",
            "slug": "shock-absorber-extra",
            "category_id": self.category.pk,
            "sales_method": Product.SalesMethod.DIRECT_PURCHASE,
            "publication_status": Product.PublicationStatus.PUBLISHED,
            "price": "200.00",
            "currency": "GHS",
            "images": [
                {"image_url": "https://images.example.test/1.jpg", "alt_text": "1", "display_order": 0, "is_primary": True},
                {"image_url": "https://images.example.test/2.jpg", "alt_text": "2", "display_order": 1, "is_primary": False},
                {"image_url": "https://images.example.test/3.jpg", "alt_text": "3", "display_order": 2, "is_primary": False},
                {"image_url": "https://images.example.test/4.jpg", "alt_text": "4", "display_order": 3, "is_primary": False},
            ],
        }
        res = self.client.post(url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("images", res.data)
        self.assertIn("A product can take up to 3 product images.", str(res.data["images"]))

    def test_product_model_clean_rejects_more_than_3_images(self):
        product = Product.objects.create(
            sku="SHOCK-MODEL-001",
            name="Model Shock",
            slug="model-shock",
            category=self.category,
            sales_method=Product.SalesMethod.QUOTATION,
        )
        ProductImage.objects.create(product=product, image_url="https://images.test/1.jpg", display_order=0)
        ProductImage.objects.create(product=product, image_url="https://images.test/2.jpg", display_order=1)
        ProductImage.objects.create(product=product, image_url="https://images.test/3.jpg", display_order=2)

        fourth_image = ProductImage(product=product, image_url="https://images.test/4.jpg", display_order=3)
        with self.assertRaises(ValidationError) as ctx:
            fourth_image.clean()
        self.assertIn("A product can take up to 3 product images.", str(ctx.exception))

    @patch("apps.catalogue.media_service.is_cloudinary_configured", return_value=False)
    def test_staff_product_create_with_direct_file_upload(self, _mock_cloudinary):
        self.client.force_authenticate(user=self.staff_user)
        url = reverse("api:catalogue:staff-product-list")
        file1 = SimpleUploadedFile("front.jpg", b"\xff\xd8\xff\xe0img1", content_type="image/jpeg")
        file2 = SimpleUploadedFile("rear.png", b"\x89PNG\r\n\x1a\nimg2", content_type="image/png")
        file3 = SimpleUploadedFile("detail.jpg", b"\xff\xd8\xff\xe0img3", content_type="image/jpeg")

        data = {
            "sku": "UPLOAD-PROD-001",
            "name": "Direct Upload Product",
            "slug": "direct-upload-product",
            "category_id": self.category.pk,
            "sales_method": Product.SalesMethod.DIRECT_PURCHASE,
            "publication_status": Product.PublicationStatus.PUBLISHED,
            "price": "300.00",
            "currency": "GHS",
            "images": [file1, file2, file3],
        }
        res = self.client.post(url, data, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(res.data["images"]), 3)
        self.assertTrue(res.data["images"][0]["is_primary"])
        self.assertEqual(res.data["images"][0]["display_order"], 0)
        self.assertEqual(res.data["images"][1]["display_order"], 1)
        self.assertEqual(res.data["images"][2]["display_order"], 2)

    @patch("apps.catalogue.media_service.is_cloudinary_configured", return_value=False)
    def test_staff_product_file_upload_rejects_more_than_3_files(self, _mock_cloudinary):
        self.client.force_authenticate(user=self.staff_user)
        url = reverse("api:catalogue:staff-product-list")
        files = [
            SimpleUploadedFile(f"img{i}.jpg", b"\xff\xd8\xff\xe0fake", content_type="image/jpeg")
            for i in range(4)
        ]
        data = {
            "sku": "UPLOAD-FAIL-001",
            "name": "Too Many Images",
            "slug": "too-many-images",
            "category_id": self.category.pk,
            "sales_method": Product.SalesMethod.QUOTATION,
            "images": files,
        }
        res = self.client.post(url, data, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("A product can take up to 3 product images.", str(res.data["images"]))

    @patch("apps.catalogue.media_service.is_cloudinary_configured", return_value=False)
    def test_staff_category_create_with_direct_file_upload(self, _mock_cloudinary):
        self.client.force_authenticate(user=self.staff_user)
        url = reverse("api:catalogue:staff-category-list")
        cat_file = SimpleUploadedFile("category.jpg", b"\xff\xd8\xff\xe0catimg", content_type="image/jpeg")
        data = {
            "name": "Braking Systems",
            "slug": "braking-systems",
            "product_type": Product.ProductType.SPARE_PART,
            "image_file": cat_file,
        }
        res = self.client.post(url, data, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(bool(res.data["image_url"]))
        cat = Category.objects.get(slug="braking-systems")
        self.assertTrue(bool(cat.image_url))

    @patch("apps.catalogue.media_service.is_cloudinary_configured", return_value=False)
    def test_staff_brand_create_with_direct_file_upload(self, _mock_cloudinary):
        self.client.force_authenticate(user=self.staff_user)
        url = reverse("api:catalogue:staff-brand-list")
        logo_file = SimpleUploadedFile("brand_logo.png", b"\x89PNG\r\n\x1a\nlogo", content_type="image/png")
        data = {
            "name": "Brembo",
            "slug": "brembo",
            "logo_file": logo_file,
        }
        res = self.client.post(url, data, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(bool(res.data["logo_url"]))
        brand = Brand.objects.get(slug="brembo")
        self.assertTrue(bool(brand.logo_url))

    @patch("apps.catalogue.media_service.is_cloudinary_configured", return_value=False)
    def test_staff_promotion_create_with_direct_file_upload(self, _mock_cloudinary):
        self.client.force_authenticate(user=self.staff_user)
        url = reverse("api:catalogue:staff-promotion-list")
        promo_file = SimpleUploadedFile("promo.webp", b"RIFFfakeWEBP", content_type="image/webp")
        data = {
            "title": "Summer Brake Discount",
            "slug": "summer-brake-discount",
            "image_file": promo_file,
            "is_active": True,
        }
        res = self.client.post(url, data, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(bool(res.data["image_url"]))

    @patch("apps.catalogue.media_service.is_cloudinary_configured", return_value=False)
    def test_staff_homepage_settings_with_direct_file_upload(self, _mock_cloudinary):
        self.client.force_authenticate(user=self.staff_user)
        url = reverse("api:catalogue:staff-homepage")
        hero_file = SimpleUploadedFile("hero.jpg", b"\xff\xd8\xff\xe0hero", content_type="image/jpeg")
        data = {
            "hero_heading": "Brand New Fleet",
            "hero_image_file": hero_file,
        }
        res = self.client.patch(url, data, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(bool(res.data["hero_image_url"]))

    def test_product_image_admin_form_enforces_max_3_images(self):
        from apps.catalogue.admin import ProductImageAdminForm
        product = Product.objects.create(
            sku="ADMIN-FORM-001",
            name="Admin Form Part",
            slug="admin-form-part",
            category=self.category,
            sales_method=Product.SalesMethod.QUOTATION,
        )
        file1 = SimpleUploadedFile("1.jpg", b"\xff\xd8\xff\xe0img1", content_type="image/jpeg")
        file2 = SimpleUploadedFile("2.jpg", b"\xff\xd8\xff\xe0img2", content_type="image/jpeg")
        file3 = SimpleUploadedFile("3.jpg", b"\xff\xd8\xff\xe0img3", content_type="image/jpeg")
        file4 = SimpleUploadedFile("4.jpg", b"\xff\xd8\xff\xe0img4", content_type="image/jpeg")

        # 3 valid images
        for i, f in enumerate((file1, file2, file3)):
            form = ProductImageAdminForm(
                data={"product": product.pk, "alt_text": f"Image {i}", "display_order": i, "is_primary": (i == 0)},
                files={"image_file": f},
            )
            self.assertTrue(form.is_valid(), form.errors)
            obj = form.save(commit=False)
            obj.image_url = f"https://res.example.com/{i}.jpg"
            obj.save()

        self.assertEqual(product.images.count(), 3)

        # 4th image must fail validation
        form_fail = ProductImageAdminForm(
            data={"product": product.pk, "alt_text": "Image 4", "display_order": 3, "is_primary": False},
            files={"image_file": file4},
        )
        self.assertFalse(form_fail.is_valid())
        self.assertIn("already has 3 product images", str(form_fail.errors))
