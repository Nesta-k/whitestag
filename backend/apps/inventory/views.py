from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import APIException, NotFound, ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalogue.models import Product

from .models import InventoryRecord, StockMovement
from .pagination import InventoryPagination
from .serializers import (
    InventoryRecordSerializer,
    StockAdjustmentInputSerializer,
    StockMovementSerializer,
    StockOperationInputSerializer,
    StockOperationResultSerializer,
)
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


class StockConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "stock_conflict"


class InventoryRecordListView(ListAPIView):
    queryset = InventoryRecord.objects.select_related("product").all()
    serializer_class = InventoryRecordSerializer
    permission_classes = [IsAdminUser]
    pagination_class = InventoryPagination


class InventoryRecordDetailView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request, product_id):
        inventory = get_object_or_404(
            InventoryRecord.objects.select_related("product"),
            product_id=product_id,
        )
        return Response(InventoryRecordSerializer(inventory).data)


class StockMovementListView(ListAPIView):
    serializer_class = StockMovementSerializer
    permission_classes = [IsAdminUser]
    pagination_class = InventoryPagination

    def get_queryset(self):
        inventory = get_object_or_404(
            InventoryRecord.objects.only("pk"),
            product_id=self.kwargs["product_id"],
        )
        return inventory.movements.select_related(
            "inventory_record__product",
            "created_by",
        )


class StockOperationView(APIView):
    permission_classes = [IsAdminUser]
    serializer_class = StockOperationInputSerializer
    operation = None

    def post(self, request, product_id):
        input_data = request.data.copy()
        input_data["idempotency_key"] = request.headers.get("Idempotency-Key", "")
        serializer = self.serializer_class(data=input_data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        operation_kwargs = {
            "idempotency_key": values["idempotency_key"],
            "reason": values.get("reason", ""),
            "reference": values.get("reference", ""),
            "created_by": request.user,
        }

        try:
            if self.operation == "adjust":
                result = adjust_stock(
                    product_id,
                    values["quantity"],
                    **operation_kwargs,
                )
            else:
                result = self.operation(
                    product_id,
                    values["quantity"],
                    **operation_kwargs,
                )
        except Product.DoesNotExist as exc:
            raise NotFound("Product not found.") from exc
        except InvalidStockOperation as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        except (InsufficientStock, IdempotencyConflict) as exc:
            raise StockConflict(detail=str(exc)) from exc

        response_data = StockOperationResultSerializer(
            {"inventory": result.inventory, "movement": result.movement}
        ).data
        return Response(response_data, status=status.HTTP_200_OK)


class ReceiveStockView(StockOperationView):
    operation = staticmethod(receive_stock)


class AdjustStockView(StockOperationView):
    serializer_class = StockAdjustmentInputSerializer
    operation = "adjust"


class ReserveStockView(StockOperationView):
    operation = staticmethod(reserve_stock)


class ReleaseReservationView(StockOperationView):
    operation = staticmethod(release_reservation)


class RecordSaleView(StockOperationView):
    operation = staticmethod(record_sale)


class RecordReturnView(StockOperationView):
    operation = staticmethod(record_return)
