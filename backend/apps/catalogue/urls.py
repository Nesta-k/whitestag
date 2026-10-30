from django.urls import path

from .views import (
    BrandListView,
    CategoryListView,
    HomepagePublicView,
    ProductDetailView,
    ProductListView,
    PromotionListView,
    StaffBrandDetailView,
    StaffBrandListCreateView,
    StaffCategoryDetailView,
    StaffCategoryListCreateView,
    StaffHomepageSettingsView,
    StaffMediaUploadView,
    StaffProductDetailView,
    StaffProductListCreateView,
    StaffPromotionDetailView,
    StaffPromotionListCreateView,
)


app_name = "catalogue"

urlpatterns = [
    path("categories/", CategoryListView.as_view(), name="category-list"),
    path("brands/", BrandListView.as_view(), name="brand-list"),
    path("products/", ProductListView.as_view(), name="product-list"),
    path("products/<slug:slug>/", ProductDetailView.as_view(), name="product-detail"),
    path("homepage/", HomepagePublicView.as_view(), name="homepage"),
    path("promotions/", PromotionListView.as_view(), name="promotion-list"),
    path("staff/media/", StaffMediaUploadView.as_view(), name="staff-media-upload"),
    path(
        "staff/homepage/",
        StaffHomepageSettingsView.as_view(),
        name="staff-homepage",
    ),
    path(
        "staff/promotions/",
        StaffPromotionListCreateView.as_view(),
        name="staff-promotion-list",
    ),
    path(
        "staff/promotions/<int:pk>/",
        StaffPromotionDetailView.as_view(),
        name="staff-promotion-detail",
    ),
    path(
        "staff/products/",
        StaffProductListCreateView.as_view(),
        name="staff-product-list",
    ),
    path(
        "staff/products/<int:pk>/",
        StaffProductDetailView.as_view(),
        name="staff-product-detail",
    ),
    path(
        "staff/categories/",
        StaffCategoryListCreateView.as_view(),
        name="staff-category-list",
    ),
    path(
        "staff/categories/<int:pk>/",
        StaffCategoryDetailView.as_view(),
        name="staff-category-detail",
    ),
    path(
        "staff/brands/",
        StaffBrandListCreateView.as_view(),
        name="staff-brand-list",
    ),
    path(
        "staff/brands/<int:pk>/",
        StaffBrandDetailView.as_view(),
        name="staff-brand-detail",
    ),
]
