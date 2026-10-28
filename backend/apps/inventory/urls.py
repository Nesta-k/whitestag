from django.urls import path

from .views import (
    AdjustStockView,
    InventoryRecordDetailView,
    InventoryRecordListView,
    ReceiveStockView,
    RecordReturnView,
    RecordSaleView,
    ReleaseReservationView,
    ReserveStockView,
    StockMovementListView,
)


app_name = "inventory"

urlpatterns = [
    path("", InventoryRecordListView.as_view(), name="record-list"),
    path("<int:product_id>/", InventoryRecordDetailView.as_view(), name="record-detail"),
    path(
        "<int:product_id>/movements/",
        StockMovementListView.as_view(),
        name="movement-list",
    ),
    path("<int:product_id>/receive/", ReceiveStockView.as_view(), name="receive"),
    path("<int:product_id>/adjust/", AdjustStockView.as_view(), name="adjust"),
    path("<int:product_id>/reserve/", ReserveStockView.as_view(), name="reserve"),
    path(
        "<int:product_id>/release/",
        ReleaseReservationView.as_view(),
        name="release",
    ),
    path("<int:product_id>/sale/", RecordSaleView.as_view(), name="sale"),
    path("<int:product_id>/return/", RecordReturnView.as_view(), name="return"),
]
