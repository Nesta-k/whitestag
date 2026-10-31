from uuid import uuid4
from unittest.mock import ANY, patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.catalogue.models import Category, Product, ProductImage
from apps.inventory.models import InventoryRecord, StockMovement
from apps.inventory.services import receive_stock

from .google_auth import (
    GoogleIdentityError,
    validate_google_claims,
    verify_google_id_token,
)
from .google_accounts import get_or_create_google_customer
from .models import (
    Cart,
    CartItem,
    CustomerAccount,
    UserProfile,
    WishlistItem,
    get_user_role,
)


class CustomerAccountApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.register_url = reverse("api:customers:register")
        self.login_url = reverse("api:customers:login")
        self.google_login_url = reverse("api:customers:google-login")

    def register(self, email="customer@example.com", password="Violet-River-82!"):
        return self.client.post(
            self.register_url,
            {
                "email": email,
                "password": password,
                "password_confirm": password,
            },
            format="json",
        )

    def google_login(self, credential="test-google-id-token"):
        return self.client.post(
            self.google_login_url,
            {"credential": credential},
            format="json",
        )

    def test_registration_hashes_password_and_returns_minimal_customer(self):
        response = self.register()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(set(response.data), {"token", "customer"})
        self.assertEqual(
            set(response.data["customer"]),
            {"id", "email", "first_name", "last_name", "created_at"},
        )
        self.assertEqual(response.data["customer"]["email"], "customer@example.com")
        self.assertEqual(response.data["customer"]["first_name"], "")
        self.assertEqual(response.data["customer"]["last_name"], "")
        user = get_user_model().objects.get(email="customer@example.com")
        self.assertNotEqual(user.password, "Violet-River-82!")
        self.assertTrue(user.check_password("Violet-River-82!"))
        self.assertTrue(CustomerAccount.objects.filter(user=user).exists())
        self.assertTrue(Cart.objects.filter(customer__user=user).exists())
        self.assertTrue(Token.objects.filter(user=user).exists())

    def test_registration_rejects_duplicate_email_case_insensitively(self):
        self.assertEqual(self.register().status_code, status.HTTP_201_CREATED)
        response = self.register(email="CUSTOMER@EXAMPLE.COM")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)
        self.assertEqual(get_user_model().objects.count(), 1)

    def test_registration_validates_password_and_confirmation(self):
        mismatch_response = self.client.post(
            self.register_url,
            {
                "email": "new@example.com",
                "password": "Violet-River-82!",
                "password_confirm": "different",
            },
            format="json",
        )
        weak_password_response = self.client.post(
            self.register_url,
            {
                "email": "new@example.com",
                "password": "12345678",
                "password_confirm": "12345678",
            },
            format="json",
        )

        self.assertEqual(mismatch_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(weak_password_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", weak_password_response.data)
        self.assertFalse(CustomerAccount.objects.exists())
        self.assertFalse(get_user_model().objects.exists())

    def test_login_current_user_and_logout_invalidate_token(self):
        self.assertEqual(self.register().status_code, status.HTTP_201_CREATED)
        response = self.client.post(
            self.login_url,
            {"email": "CUSTOMER@example.com", "password": "Violet-River-82!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        token = response.data["token"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        me_response = self.client.get(reverse("api:customers:me"))
        self.assertEqual(me_response.status_code, status.HTTP_200_OK)
        self.assertEqual(me_response.data["email"], "customer@example.com")
        self.assertNotIn("password", me_response.data)
        self.assertNotIn("is_staff", me_response.data)

        logout_response = self.client.post(reverse("api:customers:logout"))
        self.assertEqual(logout_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Token.objects.filter(key=token).exists())
        self.assertEqual(
            self.client.get(reverse("api:customers:me")).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_login_failure_is_generic_and_current_user_requires_authentication(self):
        self.assertEqual(self.register().status_code, status.HTTP_201_CREATED)
        response = self.client.post(
            self.login_url,
            {"email": "missing@example.com", "password": "incorrect"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("Invalid email or password.", str(response.data))
        wrong_password = self.client.post(
            self.login_url,
            {"email": "customer@example.com", "password": "incorrect"},
            format="json",
        )
        self.assertEqual(wrong_password.status_code, response.status_code)
        self.assertEqual(wrong_password.data, response.data)
        self.assertEqual(
            self.client.get(reverse("api:customers:me")).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_staff_login_issues_token_only_to_active_staff_users(self):
        staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="operations@example.com",
            password="Secure-Staff-Password-92!",
            is_staff=True,
        )
        staff_login = self.client.post(
            reverse("api:customers:staff-login"),
            {
                "email": "OPERATIONS@example.com",
                "password": "Secure-Staff-Password-92!",
            },
            format="json",
        )
        customer_login = self.client.post(
            reverse("api:customers:staff-login"),
            {"email": "missing@example.com", "password": "bad"},
            format="json",
        )

        self.assertEqual(staff_login.status_code, status.HTTP_200_OK)
        self.assertEqual(set(staff_login.data), {"token", "staff"})
        self.assertEqual(staff_login.data["staff"]["email"], staff_user.email)
        self.assertEqual(customer_login.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(get_user_model().objects.count(), 1)

    def test_staff_login_accepts_superuser_username_without_email(self):
        superuser = get_user_model().objects.create_superuser(
            username="whitestag-admin",
            email="",
            password="Secure-Superuser-Password-92!",
        )

        response = self.client.post(
            reverse("api:customers:staff-login"),
            {
                "email": superuser.username,
                "password": "Secure-Superuser-Password-92!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["staff"]["id"], superuser.pk)
        self.assertTrue(Token.objects.filter(user=superuser).exists())

    def test_staff_me_and_customer_directory_reject_non_staff(self):
        self.register()
        customer_user = get_user_model().objects.get(email="customer@example.com")
        self.client.force_authenticate(user=customer_user)

        me_response = self.client.get(reverse("api:customers:staff-me"))
        customers_response = self.client.get(
            reverse("api:customers:staff-customer-list")
        )

        self.assertEqual(me_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            customers_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_superadmin_can_create_and_manage_staff_and_customer_accounts(self):
        superuser = get_user_model().objects.create_superuser(
            username="root-operations",
            email="root@example.com",
            password="Secure-Root-Password-92!",
        )
        self.client.force_authenticate(user=superuser)
        url = reverse("api:customers:superadmin-user-list")

        staff_response = self.client.post(
            url,
            {
                "username": "store-manager",
                "email": "manager@example.com",
                "first_name": "Store",
                "last_name": "Manager",
                "role": "staff",
                "password": "Secure-Manager-Password-92!",
            },
            format="json",
        )
        customer_response = self.client.post(
            url,
            {
                "username": "customer-account",
                "email": "new-customer@example.com",
                "role": "customer",
                "password": "Secure-Customer-Password-92!",
            },
            format="json",
        )

        self.assertEqual(staff_response.status_code, status.HTTP_201_CREATED)
        staff = get_user_model().objects.get(username="store-manager")
        self.assertTrue(staff.is_staff)
        self.assertFalse(staff.is_superuser)
        self.assertEqual(staff_response.data["role"], "staff")
        self.assertEqual(customer_response.status_code, status.HTTP_201_CREATED)
        customer_user = get_user_model().objects.get(username="customer-account")
        customer_account = CustomerAccount.objects.get(user=customer_user)
        self.assertTrue(Cart.objects.filter(customer=customer_account).exists())
        self.assertEqual(customer_response.data["role"], "customer")

        updated = self.client.patch(
            reverse("api:customers:superadmin-user-detail", args=[staff.pk]),
            {"role": "superuser"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        staff.refresh_from_db()
        self.assertTrue(staff.is_superuser)

    def test_superadmin_user_api_rejects_non_superusers_and_last_admin_lockout(self):
        staff = get_user_model().objects.create_user(
            username="ordinary-staff",
            email="staff@example.com",
            password="Secure-Staff-Password-92!",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff)
        list_url = reverse("api:customers:superadmin-user-list")
        self.assertEqual(
            self.client.get(list_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        superuser = get_user_model().objects.create_superuser(
            username="only-superuser",
            email="only-root@example.com",
            password="Secure-Root-Password-92!",
        )
        self.client.force_authenticate(user=superuser)
        response = self.client.patch(
            reverse("api:customers:superadmin-user-detail", args=[superuser.pk]),
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        superuser.refresh_from_db()
        self.assertTrue(superuser.is_active)

    @patch("apps.customers.views.verify_google_id_token")
    def test_google_sign_in_creates_customer_cart_and_compatible_token_response(
        self,
        verify,
    ):
        verify.return_value = {
            "sub": "google-sub-new-customer",
            "email": "New.Customer@Example.com",
            "email_verified": True,
            "given_name": "New",
            "family_name": "Customer",
        }

        with self.settings(GOOGLE_OAUTH_CLIENT_ID="white-stag-web-client"):
            response = self.google_login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.data), {"token", "customer"})
        self.assertEqual(
            set(response.data["customer"]),
            {"id", "email", "first_name", "last_name", "created_at"},
        )
        self.assertEqual(response.data["customer"]["email"], "new.customer@example.com")
        self.assertEqual(response.data["customer"]["first_name"], "New")
        self.assertEqual(response.data["customer"]["last_name"], "Customer")
        account = CustomerAccount.objects.get(google_sub="google-sub-new-customer")
        self.assertEqual(account.user.first_name, "New")
        self.assertEqual(account.user.last_name, "Customer")
        self.assertFalse(account.user.is_staff)
        self.assertFalse(account.user.is_superuser)
        self.assertFalse(account.user.has_usable_password())
        self.assertTrue(Cart.objects.filter(customer=account).exists())
        self.assertTrue(Token.objects.filter(user=account.user).exists())
        verify.assert_called_once_with(
            "test-google-id-token",
            "white-stag-web-client",
        )

    @patch("apps.customers.views.verify_google_id_token")
    def test_verified_google_email_links_existing_customer_without_duplicate(
        self,
        verify,
    ):
        registration = self.register()
        account = CustomerAccount.objects.get()
        password_hash = account.user.password
        verify.return_value = {
            "sub": "google-sub-existing-customer",
            "email": "CUSTOMER@example.com",
            "email_verified": True,
        }

        with self.settings(GOOGLE_OAUTH_CLIENT_ID="white-stag-web-client"):
            response = self.google_login()

        account.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["token"], registration.data["token"])
        self.assertEqual(account.google_sub, "google-sub-existing-customer")
        self.assertEqual(get_user_model().objects.count(), 1)
        self.assertEqual(account.user.password, password_hash)

    @patch("apps.customers.views.verify_google_id_token")
    def test_google_sign_in_rejects_invalid_expired_and_wrong_audience_tokens(
        self,
        verify,
    ):
        for reason in ("invalid", "expired", "wrong audience"):
            with self.subTest(reason=reason):
                verify.side_effect = GoogleIdentityError(
                    "Google could not verify this sign-in."
                )
                with self.settings(GOOGLE_OAUTH_CLIENT_ID="white-stag-web-client"):
                    response = self.google_login(credential=f"{reason}-credential")
                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
                self.assertFalse(CustomerAccount.objects.exists())

    def test_google_sign_in_rejects_unverified_email_claims(self):
        with self.assertRaises(GoogleIdentityError):
            validate_google_claims(
                {
                    "sub": "google-sub-unverified",
                    "email": "unverified@example.com",
                    "email_verified": False,
                }
            )
        self.assertFalse(CustomerAccount.objects.exists())

    def test_google_verifier_uses_server_audience_and_rejects_unverified_claims(self):
        claims = {
            "sub": "google-sub-verifier-test",
            "email": "verified@example.com",
            "email_verified": True,
        }
        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            return_value=claims,
        ) as verifier:
            self.assertEqual(
                verify_google_id_token("mocked-id-token", "configured-client-id"),
                claims,
            )
        verifier.assert_called_once_with(
            "mocked-id-token",
            ANY,
            audience="configured-client-id",
        )

        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            return_value={**claims, "email_verified": False},
        ):
            with self.assertRaises(GoogleIdentityError):
                verify_google_id_token("mocked-id-token", "configured-client-id")

    @patch("apps.customers.views.verify_google_id_token")
    def test_repeated_first_signin_identity_is_idempotent(self, verify):
        verify.return_value = {
            "sub": "google-sub-race",
            "email": "race@example.com",
            "email_verified": True,
        }

        with self.settings(GOOGLE_OAUTH_CLIENT_ID="white-stag-web-client"):
            first = self.google_login()
            second = self.google_login()

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["token"], second.data["token"])
        self.assertEqual(CustomerAccount.objects.count(), 1)
        self.assertEqual(Cart.objects.count(), 1)
        self.assertEqual(get_user_model().objects.count(), 1)

    def test_google_sign_in_recovers_from_concurrent_unique_account_creation(self):
        user = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="race@example.com",
            password="Original-Password-83!",
        )
        concurrent_account = CustomerAccount.objects.create(
            user=user,
            email="race@example.com",
        )
        claims = {
            "sub": "google-sub-race-recovery",
            "email": "RACE@example.com",
            "email_verified": True,
        }

        with patch(
            "apps.customers.google_accounts._customer_for_verified_claims",
            side_effect=IntegrityError("concurrent unique constraint"),
        ):
            account = get_or_create_google_customer(claims)

        concurrent_account.refresh_from_db()
        self.assertEqual(account.pk, concurrent_account.pk)
        self.assertEqual(account.google_sub, "google-sub-race-recovery")
        self.assertEqual(account.user.password, user.password)
        self.assertTrue(Cart.objects.filter(customer=account).exists())
        self.assertEqual(CustomerAccount.objects.count(), 1)

    @patch("apps.customers.views.verify_google_id_token")
    def test_google_sign_in_cannot_authenticate_staff_customer_accounts(self, verify):
        staff_user = get_user_model().objects.create_user(
            username=uuid4().hex,
            email="staff@example.com",
            password="Staff-Password-92!",
            is_staff=True,
        )
        CustomerAccount.objects.create(
            user=staff_user,
            email="staff@example.com",
        )
        verify.return_value = {
            "sub": "google-sub-staff",
            "email": "staff@example.com",
            "email_verified": True,
        }

        with self.settings(GOOGLE_OAUTH_CLIENT_ID="white-stag-web-client"):
            response = self.google_login()

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(Token.objects.filter(user=staff_user).exists())

    def test_google_sign_in_requires_credential(self):
        response = self.client.post(self.google_login_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CustomerAccount.objects.exists())

    @patch("apps.customers.views.verify_google_id_token")
    def test_google_sign_in_reports_missing_server_client_id(self, verify):
        with self.settings(GOOGLE_OAUTH_CLIENT_ID=""):
            response = self.google_login()

        self.assertEqual(
            response.status_code,
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
        verify.assert_not_called()
        self.assertFalse(CustomerAccount.objects.exists())


class CartApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name="Parts", slug="cart-parts")
        self.user = self.create_customer("cart-customer@example.com")
        self.client.force_authenticate(user=self.user)
        self.product = self.create_product(
            sku="CART-001",
            name="Brake pad",
            slug="brake-pad",
            product_type=Product.ProductType.SPARE_PART,
            sales_method=Product.SalesMethod.DIRECT_PURCHASE,
            publication_status=Product.PublicationStatus.PUBLISHED,
        )
        self.inventory = receive_stock(
            self.product.pk,
            10,
            idempotency_key=uuid4(),
        ).inventory

    def create_customer(self, email):
        user = get_user_model().objects.create_user(
            username=uuid4().hex,
            email=email,
            password="Violet-River-82!",
        )
        account = CustomerAccount.objects.create(user=user, email=email)
        Cart.objects.create(customer=account)
        return user

    def create_product(
        self,
        *,
        sku,
        name,
        slug,
        product_type,
        sales_method,
        publication_status,
        price="12.50",
        currency="GHS",
    ):
        return Product.objects.create(
            sku=sku,
            name=name,
            slug=slug,
            category=self.category,
            product_type=product_type,
            sales_method=sales_method,
            publication_status=publication_status,
            price=price,
            currency=currency,
        )

    def add_product(self, product=None, quantity=2):
        return self.client.post(
            reverse("api:customers:cart-item-create"),
            {
                "product_id": (product or self.product).pk,
                "quantity": quantity,
                "price": "0.01",
            },
            format="json",
        )

    def test_cart_add_consolidates_duplicate_product_and_returns_current_price(self):
        first = self.add_product(quantity=2)
        second = self.add_product(quantity=3)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.data["quantity"], 5)
        self.assertEqual(second.data["product"]["price"], "12.50")
        self.assertEqual(CartItem.objects.count(), 1)
        self.assertEqual(self.inventory.refresh_from_db(), None)
        self.assertEqual(self.inventory.available_quantity, 10)
        self.assertEqual(
            StockMovement.objects.filter(inventory_record=self.inventory).count(),
            1,
        )

    def test_cart_view_update_and_remove_are_persistent(self):
        add_response = self.add_product(quantity=2)
        item_id = add_response.data["id"]
        ProductImage.objects.create(
            product=self.product,
            image_url="https://images.example.test/other-view.jpg",
            alt_text="Other view",
            display_order=0,
            is_primary=False,
        )
        ProductImage.objects.create(
            product=self.product,
            image_url="https://images.example.test/brake-pad.jpg",
            alt_text="Brake pad",
            display_order=1,
            is_primary=True,
        )

        cart_response = self.client.get(reverse("api:customers:cart"))
        self.assertEqual(cart_response.status_code, status.HTTP_200_OK)
        self.assertEqual(cart_response.data["item_count"], 2)
        self.assertEqual(len(cart_response.data["items"]), 1)
        self.assertEqual(
            cart_response.data["items"][0]["product"]["image_url"],
            "https://images.example.test/brake-pad.jpg",
        )

        update_response = self.client.patch(
            reverse("api:customers:cart-item-detail", args=[item_id]),
            {"quantity": 4},
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertEqual(update_response.data["quantity"], 4)

        delete_response = self.client.delete(
            reverse("api:customers:cart-item-detail", args=[item_id])
        )
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(CartItem.objects.count(), 0)

    def test_cart_rejects_nonpositive_and_noninteger_quantities(self):
        for quantity in (0, -1, 1.5, True):
            with self.subTest(quantity=quantity):
                response = self.add_product(quantity=quantity)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CartItem.objects.count(), 0)

    def test_cart_accepts_direct_purchase_vehicles(self):
        vehicle = self.create_product(
            sku="CART-CAR",
            name="Vehicle",
            slug="cart-vehicle",
            product_type=Product.ProductType.CAR,
            sales_method=Product.SalesMethod.DIRECT_PURCHASE,
            publication_status=Product.PublicationStatus.PUBLISHED,
        )
        receive_stock(vehicle.pk, 10, idempotency_key=uuid4())

        response = self.add_product(product=vehicle)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["product"]["id"], vehicle.pk)

    def test_cart_rejects_quote_only_unpublished_and_unpriced_products(self):
        products = [
            self.create_product(
                sku="CART-QUOTE",
                name="Quote part",
                slug="cart-quote-part",
                product_type=Product.ProductType.SPARE_PART,
                sales_method=Product.SalesMethod.QUOTATION,
                publication_status=Product.PublicationStatus.PUBLISHED,
            ),
            self.create_product(
                sku="CART-DRAFT",
                name="Draft part",
                slug="cart-draft-part",
                product_type=Product.ProductType.SPARE_PART,
                sales_method=Product.SalesMethod.DIRECT_PURCHASE,
                publication_status=Product.PublicationStatus.DRAFT,
            ),
            self.create_product(
                sku="CART-UNPRICED",
                name="Unpriced part",
                slug="cart-unpriced-part",
                product_type=Product.ProductType.SPARE_PART,
                sales_method=Product.SalesMethod.DIRECT_PURCHASE,
                publication_status=Product.PublicationStatus.PUBLISHED,
                price=None,
            ),
            self.create_product(
                sku="CART-ZERO",
                name="Free part",
                slug="cart-free-part",
                product_type=Product.ProductType.SPARE_PART,
                sales_method=Product.SalesMethod.DIRECT_PURCHASE,
                publication_status=Product.PublicationStatus.PUBLISHED,
                price="0.00",
            ),
            self.create_product(
                sku="CART-USD",
                name="Unsupported currency part",
                slug="cart-unsupported-currency",
                product_type=Product.ProductType.SPARE_PART,
                sales_method=Product.SalesMethod.DIRECT_PURCHASE,
                publication_status=Product.PublicationStatus.PUBLISHED,
                currency="USD",
            ),
        ]

        for product in products:
            with self.subTest(product=product.sku):
                response = self.add_product(product=product)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CartItem.objects.count(), 0)

    def test_unavailable_or_insufficient_stock_is_rejected(self):
        no_stock = self.create_product(
            sku="CART-EMPTY",
            name="Out of stock",
            slug="cart-out-of-stock",
            product_type=Product.ProductType.SPARE_PART,
            sales_method=Product.SalesMethod.DIRECT_PURCHASE,
            publication_status=Product.PublicationStatus.PUBLISHED,
        )
        response_without_inventory = self.add_product(product=no_stock)
        self.assertEqual(
            response_without_inventory.status_code,
            status.HTTP_409_CONFLICT,
        )

        response_over_stock = self.add_product(quantity=11)
        self.assertEqual(response_over_stock.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(CartItem.objects.count(), 0)

    def test_existing_cart_line_reflects_price_changes_and_unavailability(self):
        response = self.add_product(quantity=3)
        item_id = response.data["id"]
        self.product.price = "14.75"
        self.product.save(update_fields=["price"])
        self.inventory.available_quantity = 2
        self.inventory.save(update_fields=["available_quantity"])

        cart_response = self.client.get(reverse("api:customers:cart"))
        line = cart_response.data["items"][0]
        self.assertEqual(line["product"]["price"], "14.75")
        self.assertFalse(line["is_available"])

        over_stock_update = self.client.patch(
            reverse("api:customers:cart-item-detail", args=[item_id]),
            {"quantity": 3},
            format="json",
        )
        self.assertEqual(over_stock_update.status_code, status.HTTP_409_CONFLICT)

        self.product.publication_status = Product.PublicationStatus.ARCHIVED
        self.product.save(update_fields=["publication_status"])
        cart_response = self.client.get(reverse("api:customers:cart"))
        line = cart_response.data["items"][0]
        self.assertIsNone(line["product"])
        self.assertFalse(line["is_available"])

        update_response = self.client.patch(
            reverse("api:customers:cart-item-detail", args=[item_id]),
            {"quantity": 1},
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_customers_cannot_access_another_users_cart_items(self):
        add_response = self.add_product(quantity=2)
        item_id = add_response.data["id"]
        other_user = self.create_customer("other-cart-customer@example.com")
        self.client.force_authenticate(user=other_user)

        self.assertEqual(
            self.client.get(reverse("api:customers:cart")).data["items"],
            [],
        )
        patch_response = self.client.patch(
            reverse("api:customers:cart-item-detail", args=[item_id]),
            {"quantity": 1},
            format="json",
        )
        delete_response = self.client.delete(
            reverse("api:customers:cart-item-detail", args=[item_id])
        )
        self.assertEqual(patch_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(delete_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(CartItem.objects.filter(pk=item_id).exists())

    def test_cart_endpoints_require_a_registered_customer(self):
        self.client.force_authenticate(user=get_user_model().objects.create_user(
            username=uuid4().hex,
            password="Violet-River-82!",
        ))

        self.assertEqual(
            self.client.get(reverse("api:customers:cart")).status_code,
            status.HTTP_403_FORBIDDEN,
        )


class WishlistApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name="Wishlist parts", slug="wishlist-parts")
        self.user = self.create_customer("wishlist-customer@example.com")
        self.client.force_authenticate(user=self.user)
        self.product = self.create_product(
            sku="WISHLIST-001",
            name="Brake pad",
            slug="wishlist-brake-pad",
        )

    def create_customer(self, email):
        user = get_user_model().objects.create_user(
            username=uuid4().hex,
            email=email,
            password="wishlist-test-password",
        )
        CustomerAccount.objects.create(user=user, email=email)
        return user

    def create_product(self, *, sku, name, slug, product_type=None, status=None):
        return Product.objects.create(
            sku=sku,
            name=name,
            slug=slug,
            category=self.category,
            product_type=product_type or Product.ProductType.SPARE_PART,
            sales_method=Product.SalesMethod.QUOTATION,
            publication_status=status or Product.PublicationStatus.PUBLISHED,
        )

    def add_product(self, product_id):
        return self.client.post(
            reverse("api:customers:wishlist"),
            {"product_id": product_id},
            format="json",
        )

    def test_customer_can_add_and_list_wishlist_products(self):
        response = self.add_product(self.product.pk)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["product"]["id"], self.product.pk)
        self.assertEqual(WishlistItem.objects.count(), 1)

        listing = self.client.get(reverse("api:customers:wishlist"))
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(listing.data["count"], 1)
        self.assertEqual(listing.data["results"][0]["id"], response.data["id"])

    def test_duplicate_wishlist_add_is_idempotent(self):
        first = self.add_product(self.product.pk)
        duplicate = self.add_product(self.product.pk)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(duplicate.status_code, status.HTTP_200_OK)
        self.assertEqual(duplicate.data["id"], first.data["id"])
        self.assertEqual(WishlistItem.objects.count(), 1)

    def test_wishlist_supports_published_vehicle_listings(self):
        vehicle = self.create_product(
            sku="WISHLIST-CAR",
            name="Electric car",
            slug="wishlist-electric-car",
            product_type=Product.ProductType.ELECTRIC_VEHICLE,
        )

        response = self.add_product(vehicle.pk)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["product"]["product_type"], "electric_vehicle")

    def test_unpublished_and_nonexistent_products_are_rejected(self):
        draft = self.create_product(
            sku="WISHLIST-DRAFT",
            name="Draft part",
            slug="wishlist-draft-part",
            status=Product.PublicationStatus.DRAFT,
        )

        for product_id in (draft.pk, 999999):
            with self.subTest(product_id=product_id):
                response = self.add_product(product_id)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("product_id", response.data)
        self.assertEqual(WishlistItem.objects.count(), 0)

    def test_customer_can_remove_only_their_own_wishlist_items(self):
        item = self.add_product(self.product.pk)
        item_id = item.data["id"]
        other_user = self.create_customer("other-wishlist@example.com")
        self.client.force_authenticate(user=other_user)

        listing = self.client.get(reverse("api:customers:wishlist"))
        denied = self.client.delete(
            reverse("api:customers:wishlist-item-detail", args=[item_id])
        )
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(listing.data["count"], 0)
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(WishlistItem.objects.filter(pk=item_id).exists())

        self.client.force_authenticate(user=self.user)
        removed = self.client.delete(
            reverse("api:customers:wishlist-item-detail", args=[item_id])
        )
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(WishlistItem.objects.filter(pk=item_id).exists())

    def test_wishlist_endpoints_require_authentication(self):
        self.client.force_authenticate(user=None)
        list_response = self.client.get(reverse("api:customers:wishlist"))
        create_response = self.add_product(self.product.pk)
        remove_response = self.client.delete(
            reverse("api:customers:wishlist-item-detail", args=[1])
        )

        for response in (list_response, create_response, remove_response):
            self.assertIn(
                response.status_code,
                (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
            )


class UserRoleAndPermissionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

        # 1. Superadmin (Developer)
        self.developer = get_user_model().objects.create_superuser(
            username="developer-superadmin",
            email="developer@whitestag.com",
            password="Secure-Developer-Password-99!",
        )

        # 2. Admin (Owner)
        self.owner = get_user_model().objects.create_user(
            username="business-owner",
            email="owner@whitestag.com",
            password="Secure-Owner-Password-99!",
            is_staff=True,
        )
        owner_profile, _ = UserProfile.objects.update_or_create(
            user=self.owner,
            defaults={"role": UserProfile.Role.ADMIN},
        )
        self.owner.profile = owner_profile

        # 3. Staff (Operations)
        self.staff_member = get_user_model().objects.create_user(
            username="warehouse-staff",
            email="staff@whitestag.com",
            password="Secure-Staff-Password-99!",
            is_staff=True,
        )
        staff_profile, _ = UserProfile.objects.update_or_create(
            user=self.staff_member,
            defaults={"role": UserProfile.Role.STAFF},
        )
        self.staff_member.profile = staff_profile

        # 4. Customer (Buyer)
        self.customer_user = get_user_model().objects.create_user(
            username="online-shopper",
            email="customer@whitestag.com",
            password="Secure-Customer-Password-99!",
        )
        self.customer_account = CustomerAccount.objects.create(
            user=self.customer_user,
            email=self.customer_user.email,
        )
        Cart.objects.create(customer=self.customer_account)

    def test_role_resolution(self):
        self.assertEqual(get_user_role(self.developer), UserProfile.Role.SUPERADMIN)
        self.assertEqual(get_user_role(self.owner), UserProfile.Role.ADMIN)
        self.assertEqual(get_user_role(self.staff_member), UserProfile.Role.STAFF)
        self.assertEqual(get_user_role(self.customer_user), UserProfile.Role.CUSTOMER)

    def test_staff_login_and_me_endpoints_return_correct_roles(self):
        login_url = reverse("api:customers:staff-login")
        me_url = reverse("api:customers:staff-me")

        # Test Developer staff login
        dev_res = self.client.post(
            login_url,
            {"email": "developer@whitestag.com", "password": "Secure-Developer-Password-99!"},
            format="json",
        )
        self.assertEqual(dev_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dev_res.data["staff"]["role"], "superadmin")

        # Test Owner staff login
        owner_res = self.client.post(
            login_url,
            {"email": "owner@whitestag.com", "password": "Secure-Owner-Password-99!"},
            format="json",
        )
        self.assertEqual(owner_res.status_code, status.HTTP_200_OK)
        self.assertEqual(owner_res.data["staff"]["role"], "admin")

        # Test Staff login
        staff_res = self.client.post(
            login_url,
            {"email": "staff@whitestag.com", "password": "Secure-Staff-Password-99!"},
            format="json",
        )
        self.assertEqual(staff_res.status_code, status.HTTP_200_OK)
        self.assertEqual(staff_res.data["staff"]["role"], "staff")

        # Test Customer cannot log in via staff-login
        cust_res = self.client.post(
            login_url,
            {"email": "customer@whitestag.com", "password": "Secure-Customer-Password-99!"},
            format="json",
        )
        self.assertEqual(cust_res.status_code, status.HTTP_401_UNAUTHORIZED)

        # Test staff-me endpoint as Owner
        self.client.force_authenticate(user=self.owner)
        me_res = self.client.get(me_url)
        self.assertEqual(me_res.status_code, status.HTTP_200_OK)
        self.assertEqual(me_res.data["role"], "admin")

    def test_owner_admin_can_manage_staff_and_customers_but_not_superadmin(self):
        user_list_url = reverse("api:customers:superadmin-user-list")

        self.client.force_authenticate(user=self.owner)

        # Owner creates a new staff member
        create_staff_res = self.client.post(
            user_list_url,
            {
                "username": "new-cashier",
                "email": "cashier@whitestag.com",
                "role": "staff",
                "password": "Secure-Cashier-Password-99!",
            },
            format="json",
        )
        self.assertEqual(create_staff_res.status_code, status.HTTP_201_CREATED)
        created_staff = get_user_model().objects.get(username="new-cashier")
        self.assertEqual(get_user_role(created_staff), UserProfile.Role.STAFF)

        # Owner creates a new customer
        create_cust_res = self.client.post(
            user_list_url,
            {
                "username": "walk-in-customer",
                "email": "walkin@whitestag.com",
                "role": "customer",
                "password": "Secure-Walkin-Password-99!",
            },
            format="json",
        )
        self.assertEqual(create_cust_res.status_code, status.HTTP_201_CREATED)
        created_cust = get_user_model().objects.get(username="walk-in-customer")
        self.assertEqual(get_user_role(created_cust), UserProfile.Role.CUSTOMER)

        # Owner attempts to create a superadmin -> 403 Forbidden
        create_super_res = self.client.post(
            user_list_url,
            {
                "username": "rogue-superadmin",
                "email": "rogue@whitestag.com",
                "role": "superadmin",
                "password": "Secure-Rogue-Password-99!",
            },
            format="json",
        )
        self.assertEqual(create_super_res.status_code, status.HTTP_403_FORBIDDEN)

        # Owner attempts to edit/deactivate the Developer superadmin -> 403 Forbidden
        dev_detail_url = reverse(
            "api:customers:superadmin-user-detail",
            args=[self.developer.pk],
        )
        edit_dev_res = self.client.patch(
            dev_detail_url,
            {"is_active": False},
            format="json",
        )
        self.assertEqual(edit_dev_res.status_code, status.HTTP_403_FORBIDDEN)
        self.developer.refresh_from_db()
        self.assertTrue(self.developer.is_active)

        # Owner can deactivate a staff member
        staff_detail_url = reverse(
            "api:customers:superadmin-user-detail",
            args=[created_staff.pk],
        )
        deactivate_staff_res = self.client.patch(
            staff_detail_url,
            {"is_active": False},
            format="json",
        )
        self.assertEqual(deactivate_staff_res.status_code, status.HTTP_200_OK)
        created_staff.refresh_from_db()
        self.assertFalse(created_staff.is_active)

    def test_ordinary_staff_cannot_manage_users(self):
        user_list_url = reverse("api:customers:superadmin-user-list")
        self.client.force_authenticate(user=self.staff_member)

        # Staff gets 403 on user list/create
        self.assertEqual(
            self.client.get(user_list_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                user_list_url,
                {
                    "username": "staff-attempt",
                    "email": "attempt@whitestag.com",
                    "password": "Password-12345!",
                },
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_django_admin_permission_reserved_for_developer(self):
        from django.contrib import admin
        from django.test import RequestFactory

        rf = RequestFactory()

        # Superadmin (Developer) has access to Django Admin
        req_dev = rf.get("/admin/")
        req_dev.user = self.developer
        self.assertTrue(admin.site.has_permission(req_dev))

        # Admin (Owner) does NOT have access to Django Admin
        req_owner = rf.get("/admin/")
        req_owner.user = self.owner
        self.assertFalse(admin.site.has_permission(req_owner))

        # Staff does NOT have access to Django Admin
        req_staff = rf.get("/admin/")
        req_staff.user = self.staff_member
        self.assertFalse(admin.site.has_permission(req_staff))
