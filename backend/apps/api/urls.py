from django.urls import include, path

from .views import health


app_name = "api"

urlpatterns = [
    path("health/", health, name="health"),
    path("", include("apps.customers.urls")),
    path("catalogue/", include("apps.catalogue.urls")),
    path("inventory/", include("apps.inventory.urls")),
    path("orders/", include("apps.orders.urls")),
    path("enquiries/", include("apps.enquiries.urls")),
]
