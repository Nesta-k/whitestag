from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VehicleEnquiryViewSet

router = DefaultRouter()
router.register(r'vehicle-enquiries', VehicleEnquiryViewSet, basename='vehicle-enquiry')

urlpatterns = [
    path('', include(router.urls)),
]
