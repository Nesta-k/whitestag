from uuid import uuid4
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from apps.catalogue.models import Category, Product
from apps.customers.models import CustomerAccount
from .models import VehicleEnquiry

class VehicleEnquiryApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name="Vehicles", slug="vehicles")
        self.product = Product.objects.create(
            sku="CAR-001",
            name="Test Vehicle",
            slug="test-vehicle",
            category=self.category,
            product_type=Product.ProductType.CAR,
            sales_method=Product.SalesMethod.QUOTATION,
            publication_status=Product.PublicationStatus.PUBLISHED,
        )
        self.staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="staff@example.com",
            password="Staff-Password-1!",
            is_staff=True,
        )
        self.customer_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="customer@example.com",
            password="Customer-Password-1!",
        )
        self.customer_account = CustomerAccount.objects.create(
            user=self.customer_user,
            email=self.customer_user.email
        )

    def test_public_can_submit_enquiry(self):
        url = reverse("api:vehicle-enquiry-list")
        data = {
            "product": self.product.pk,
            "name": "Guest User",
            "email": "guest@example.com",
            "phone_number": "1234567890",
            "message": "I am interested in this vehicle."
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(VehicleEnquiry.objects.count(), 1)
        enquiry = VehicleEnquiry.objects.first()
        self.assertEqual(enquiry.name, "Guest User")
        self.assertIsNone(enquiry.customer)

    def test_logged_in_customer_submission_links_account(self):
        self.client.force_authenticate(user=self.customer_user)
        url = reverse("api:vehicle-enquiry-list")
        data = {
            "product": self.product.pk,
            "name": "Logged-in Customer",
            "email": self.customer_user.email,
            "phone_number": "0987654321",
            "message": "Interested customer here."
        }
        response = self.client.post(url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        enquiry = VehicleEnquiry.objects.first()
        self.assertEqual(enquiry.customer, self.customer_account)

    def test_public_cannot_list_enquiries(self):
        url = reverse("api:vehicle-enquiry-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_list_and_update_enquiries(self):
        # Create an enquiry first
        enquiry = VehicleEnquiry.objects.create(
            product=self.product,
            name="Test User",
            email="test@example.com",
            phone_number="12345",
            message="Hello"
        )
        
        self.client.force_authenticate(user=self.staff_user)
        url = reverse("api:vehicle-enquiry-list")
        
        # List
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"] if "results" in response.data else response.data
        self.assertEqual(len(results), 1)
        
        # Update status
        detail_url = reverse("api:vehicle-enquiry-detail", args=[enquiry.pk])
        update_data = {"status": VehicleEnquiry.Status.IN_PROGRESS}
        response = self.client.patch(detail_url, update_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        enquiry.refresh_from_db()
        self.assertEqual(enquiry.status, VehicleEnquiry.Status.IN_PROGRESS)

    def test_unpublished_product_cannot_receive_enquiries(self):
        self.product.publication_status = Product.PublicationStatus.DRAFT
        self.product.save(update_fields=["publication_status"])
        response = self.client.post(
            reverse("api:vehicle-enquiry-list"),
            {
                "product": self.product.pk,
                "name": "Guest User",
                "email": "guest@example.com",
                "phone_number": "1234567890",
                "message": "I am interested in this vehicle.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(VehicleEnquiry.objects.count(), 0)
