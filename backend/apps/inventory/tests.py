from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.db import IntegrityError, close_old_connections, transaction
from django.test import (
    TestCase,
    TransactionTestCase,
    skipUnlessDBFeature,
)
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.catalogue.models import Category, Product

from .models import InventoryRecord, StockMovement
from .services import (
    IdempotencyConflict,
    InsufficientStock,
    InvalidStockOperation,
    adjust_stock,
    receive_stock,
    record_return,
    record_sale,
    release_reservation,
    reserve_stock,
)


class InventoryServiceTests(TestCase):
    def setUp(self):
        category = Category.objects.create(name="Parts", slug="parts")
        self.category = category
        self.product = Product.objects.create(
            sku="INV-001",
            name="Inventory test product",
            slug="inventory-test-product",
            category=category,
            product_type=Product.ProductType.SPARE_PART,
            sales_method=Product.SalesMethod.DIRECT_PURCHASE,
        )

    def perform(self, operation, *args, **kwargs):
        return operation(
            self.product.pk,
            *args,
            idempotency_key=uuid4(),
            **kwargs,
        )

    def test_receipt_and_adjustment_create_audited_movements(self):
        received = self.perform(receive_stock, 10, reason="Initial receipt")
        adjusted = self.perform(adjust_stock, -3, reason="Count correction")
        adjusted_up = self.perform(adjust_stock, 2, reason="Count correction")

        self.assertEqual(received.inventory.available_quantity, 10)
        self.assertEqual(adjusted.inventory.available_quantity, 7)
        self.assertEqual(adjusted_up.inventory.available_quantity, 9)
        self.assertEqual(adjusted.movement.available_before, 10)
        self.assertEqual(adjusted.movement.available_after, 7)
        self.assertEqual(adjusted.movement.available_delta, -3)
        self.assertEqual(adjusted_up.movement.available_delta, 2)
        self.assertEqual(
            StockMovement.objects.filter(inventory_record=adjusted_up.inventory).count(),
            3,
        )

    def test_reservation_release_sale_and_return_use_documented_buckets(self):
        self.perform(receive_stock, 10)
        reserved = self.perform(reserve_stock, 4)
        self.assertEqual(reserved.inventory.available_quantity, 6)
        self.assertEqual(reserved.inventory.reserved_quantity, 4)

        released = self.perform(release_reservation, 1)
        self.assertEqual(released.inventory.available_quantity, 7)
        self.assertEqual(released.inventory.reserved_quantity, 3)

        sale = self.perform(record_sale, 2)
        self.assertEqual(sale.inventory.available_quantity, 7)
        self.assertEqual(sale.inventory.reserved_quantity, 1)

        returned = self.perform(record_return, 1)
        self.assertEqual(returned.inventory.available_quantity, 8)
        self.assertEqual(returned.inventory.reserved_quantity, 1)
        self.assertEqual(
            [movement.movement_type for movement in StockMovement.objects.order_by("pk")],
            [
                StockMovement.MovementType.RECEIPT,
                StockMovement.MovementType.RESERVATION,
                StockMovement.MovementType.RELEASE,
                StockMovement.MovementType.SALE,
                StockMovement.MovementType.RETURN,
            ],
        )
        self.assertEqual(StockMovement.objects.count(), 5)

    def test_overselling_and_releasing_more_than_reserved_are_rejected(self):
        self.perform(receive_stock, 3)

        with self.assertRaises(InsufficientStock):
            self.perform(reserve_stock, 4)

        self.perform(reserve_stock, 2)
        with self.assertRaises(InsufficientStock):
            self.perform(release_reservation, 3)
        with self.assertRaises(InsufficientStock):
            self.perform(record_sale, 3)

        inventory = InventoryRecord.objects.get(product=self.product)
        self.assertEqual(inventory.available_quantity, 1)
        self.assertEqual(inventory.reserved_quantity, 2)
        self.assertEqual(inventory.movements.count(), 2)

    def test_invalid_zero_negative_and_non_integer_quantities_are_rejected(self):
        for quantity in (0, -1, True, 1.5):
            with self.subTest(quantity=quantity):
                with self.assertRaises(InvalidStockOperation):
                    self.perform(receive_stock, quantity)

        for adjustment in (0, True, 1.5):
            with self.subTest(adjustment=adjustment):
                with self.assertRaises(InvalidStockOperation):
                    self.perform(adjust_stock, adjustment)

        self.assertFalse(InventoryRecord.objects.filter(product=self.product).exists())

    def test_negative_adjustment_cannot_reduce_stock_below_zero(self):
        self.perform(receive_stock, 2)

        with self.assertRaises(InsufficientStock):
            self.perform(adjust_stock, -3)

        inventory = InventoryRecord.objects.get(product=self.product)
        self.assertEqual(inventory.available_quantity, 2)
        self.assertEqual(inventory.movements.count(), 1)

    def test_idempotent_retry_replays_movement_without_double_counting(self):
        key = uuid4()
        first = receive_stock(self.product.pk, 5, idempotency_key=key)
        retry = receive_stock(self.product.pk, 5, idempotency_key=key)

        self.assertEqual(retry.movement.pk, first.movement.pk)
        self.assertEqual(retry.inventory.available_quantity, 5)
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_reusing_idempotency_key_for_different_quantity_is_rejected(self):
        key = uuid4()
        receive_stock(self.product.pk, 5, idempotency_key=key)

        with self.assertRaises(IdempotencyConflict):
            receive_stock(
                self.product.pk,
                6,
                idempotency_key=key,
            )

        self.assertEqual(InventoryRecord.objects.get(product=self.product).available_quantity, 5)
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_reusing_idempotency_key_for_different_operation_is_rejected(self):
        key = uuid4()
        receive_stock(self.product.pk, 5, idempotency_key=key)

        with self.assertRaises(IdempotencyConflict):
            reserve_stock(self.product.pk, 5, idempotency_key=key)

        inventory = InventoryRecord.objects.get(product=self.product)
        self.assertEqual(inventory.available_quantity, 5)
        self.assertEqual(inventory.reserved_quantity, 0)
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_reusing_idempotency_key_for_different_product_is_rejected(self):
        other_product = Product.objects.create(
            sku="INV-002",
            name="Second inventory test product",
            slug="second-inventory-test-product",
            category=self.category,
            product_type=Product.ProductType.SPARE_PART,
            sales_method=Product.SalesMethod.DIRECT_PURCHASE,
        )
        key = uuid4()
        receive_stock(self.product.pk, 5, idempotency_key=key)

        with self.assertRaises(IdempotencyConflict):
            receive_stock(other_product.pk, 5, idempotency_key=key)

        self.assertFalse(InventoryRecord.objects.filter(product=other_product).exists())
        self.assertEqual(InventoryRecord.objects.get(product=self.product).available_quantity, 5)
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_reusing_idempotency_key_with_different_metadata_is_rejected(self):
        key = uuid4()
        first = receive_stock(
            self.product.pk,
            5,
            idempotency_key=key,
            reason="Supplier delivery",
            reference="delivery-1",
        )
        retry = receive_stock(
            self.product.pk,
            5,
            idempotency_key=key,
            reason="Supplier delivery",
            reference="delivery-1",
        )
        self.assertEqual(retry.movement.pk, first.movement.pk)

        for kwargs in (
            {"reason": "Different reason", "reference": "delivery-1"},
            {"reason": "Supplier delivery", "reference": "delivery-2"},
        ):
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(IdempotencyConflict):
                    receive_stock(
                        self.product.pk,
                        5,
                        idempotency_key=key,
                        **kwargs,
                    )

        self.assertEqual(InventoryRecord.objects.get(product=self.product).available_quantity, 5)
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_reusing_adjustment_key_with_different_direction_is_rejected(self):
        key = uuid4()
        adjust_stock(self.product.pk, 2, idempotency_key=key)

        with self.assertRaises(IdempotencyConflict):
            adjust_stock(self.product.pk, -2, idempotency_key=key)

        self.assertEqual(InventoryRecord.objects.get(product=self.product).available_quantity, 2)
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_database_constraint_rejects_negative_inventory(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                InventoryRecord.objects.create(
                    product=self.product,
                    available_quantity=-1,
                )


class InventoryApiPermissionTests(TestCase):
    def setUp(self):
        category = Category.objects.create(name="Parts", slug="api-parts")
        self.product = Product.objects.create(
            sku="API-INV-001",
            name="API inventory product",
            slug="api-inventory-product",
            category=category,
            product_type=Product.ProductType.SPARE_PART,
            sales_method=Product.SalesMethod.DIRECT_PURCHASE,
        )
        self.client = APIClient()

    def test_anonymous_and_non_staff_users_cannot_view_inventory(self):
        url = reverse("api:inventory:record-list")
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)

        receipt_url = reverse("api:inventory:receive", args=[self.product.pk])
        payload = {
            "quantity": 3,
            "reason": "Unauthorized attempt",
        }
        self.assertEqual(
            self.client.post(
                receipt_url,
                payload,
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid4()),
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        user = get_user_model().objects.create_user(
            username="customer",
            password="not-used",
        )
        self.client.force_authenticate(user=user)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.post(
                receipt_url,
                payload,
                format="json",
                HTTP_IDEMPOTENCY_KEY=str(uuid4()),
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertFalse(InventoryRecord.objects.filter(product=self.product).exists())

    def test_staff_can_view_inventory_and_record_receipts(self):
        staff_user = get_user_model().objects.create_user(
            username="staff",
            password="not-used",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff_user)

        receipt_url = reverse(
            "api:inventory:receive",
            args=[self.product.pk],
        )
        response = self.client.post(
            receipt_url,
            {"quantity": 8, "reason": "Supplier delivery"},
            format="json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["inventory"]["available_quantity"], 8)
        self.assertEqual(response.data["movement"]["created_by"], staff_user.pk)

        list_response = self.client.get(reverse("api:inventory:record-list"))
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["count"], 1)

        movements_response = self.client.get(
            reverse("api:inventory:movement-list", args=[self.product.pk])
        )
        self.assertEqual(movements_response.status_code, status.HTTP_200_OK)
        self.assertEqual(movements_response.data["count"], 1)

    def test_staff_stock_operation_requires_valid_idempotency_key(self):
        staff_user = get_user_model().objects.create_user(
            username="staff-no-key",
            password="not-used",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff_user)

        response = self.client.post(
            reverse("api:inventory:receive", args=[self.product.pk]),
            {"quantity": 8},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(InventoryRecord.objects.filter(product=self.product).exists())

    def test_staff_stock_operation_key_reuse_returns_conflict(self):
        staff_user = get_user_model().objects.create_user(
            username="staff-idempotency",
            password="test-password",
            is_staff=True,
        )
        self.client.force_authenticate(user=staff_user)
        url = reverse("api:inventory:receive", args=[self.product.pk])
        key = str(uuid4())

        first_response = self.client.post(
            url,
            {"quantity": 8},
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        conflict_response = self.client.post(
            url,
            {"quantity": 9},
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(conflict_response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            InventoryRecord.objects.get(product=self.product).available_quantity,
            8,
        )
        self.assertEqual(StockMovement.objects.count(), 1)


class InventoryConcurrencyTests(TransactionTestCase):
    def setUp(self):
        category = Category.objects.create(name="Parts", slug="concurrency-parts")
        self.category = category
        self.product = Product.objects.create(
            sku="CONC-001",
            name="Concurrency test product",
            slug="concurrency-test-product",
            category=category,
            product_type=Product.ProductType.SPARE_PART,
            sales_method=Product.SalesMethod.DIRECT_PURCHASE,
        )
        receive_stock(self.product.pk, 5, idempotency_key=uuid4())

    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_reservations_cannot_oversell(self):
        barrier = Barrier(2)

        def reserve():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                reserve_stock(
                    self.product.pk,
                    4,
                    idempotency_key=uuid4(),
                )
                return "reserved"
            except InsufficientStock:
                return "rejected"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: reserve(), range(2)))

        self.assertCountEqual(results, ["reserved", "rejected"])
        inventory = InventoryRecord.objects.get(product=self.product)
        self.assertEqual(inventory.available_quantity, 1)
        self.assertEqual(inventory.reserved_quantity, 4)

    @skipUnlessDBFeature("has_select_for_update")
    def test_concurrent_reuse_of_key_across_products_applies_once(self):
        other_product = Product.objects.create(
            sku="CONC-002",
            name="Second concurrency test product",
            slug="second-concurrency-test-product",
            category=self.category,
            product_type=Product.ProductType.SPARE_PART,
            sales_method=Product.SalesMethod.DIRECT_PURCHASE,
        )
        key = uuid4()
        barrier = Barrier(2)

        def receive(product_id):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                receive_stock(product_id, 4, idempotency_key=key)
                return "created"
            except IdempotencyConflict:
                return "conflict"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(receive, (self.product.pk, other_product.pk)))

        self.assertCountEqual(results, ["created", "conflict"])
        self.assertEqual(StockMovement.objects.filter(idempotency_key=key).count(), 1)
        self.assertEqual(
            sum(
                InventoryRecord.objects.values_list("available_quantity", flat=True)
            ),
            9,
        )
