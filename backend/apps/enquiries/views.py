from django.db.models import Q
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from .models import VehicleEnquiry
from .serializers import VehicleEnquiryPublicSerializer, VehicleEnquiryStaffSerializer
from .pagination import EnquiryPagination

class VehicleEnquiryViewSet(viewsets.ModelViewSet):
    queryset = VehicleEnquiry.objects.select_related("product", "customer").all().order_by("-created_at")
    pagination_class = EnquiryPagination
    
    def get_serializer_class(self):
        if self.request.user and self.request.user.is_staff:
            return VehicleEnquiryStaffSerializer
        return VehicleEnquiryPublicSerializer

    def get_permissions(self):
        if self.action == 'create':
            permission_classes = [permissions.AllowAny]
        else:
            permission_classes = [permissions.IsAdminUser]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Only apply filters for staff/list actions
        if self.request.user.is_staff:
            search = self.request.query_params.get("search", "").strip()
            status_filter = self.request.query_params.get("status", "").strip()
            
            if search:
                queryset = queryset.filter(
                    Q(name__icontains=search) |
                    Q(email__icontains=search) |
                    Q(product__sku__icontains=search) |
                    Q(product__name__icontains=search)
                )
            
            if status_filter:
                queryset = queryset.filter(status=status_filter)
                
        return queryset

    def perform_create(self, serializer):
        # If the user is logged in, link their customer account
        customer = None
        if self.request.user.is_authenticated and hasattr(self.request.user, 'customer_account'):
            customer = self.request.user.customer_account
        
        serializer.save(customer=customer)
