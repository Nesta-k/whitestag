from django.contrib import admin
from .models import VehicleEnquiry

@admin.register(VehicleEnquiry)
class VehicleEnquiryAdmin(admin.ModelAdmin):
    list_display = ("id", "product", "name", "email", "status", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("name", "email", "product__name", "message")
    readonly_fields = ("created_at", "updated_at")
