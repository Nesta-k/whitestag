from django.contrib import admin

from .models import WishlistItem


@admin.register(WishlistItem)
class WishlistItemAdmin(admin.ModelAdmin):
    list_display = ("customer", "product", "created_at")
    list_filter = ("created_at",)
    search_fields = ("customer__email", "product__sku", "product__name")
    readonly_fields = ("customer", "product", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
