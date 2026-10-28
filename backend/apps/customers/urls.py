from django.urls import path

from .views import (
    CartItemCreateView,
    CartItemDetailView,
    CartView,
    CurrentCustomerView,
    GoogleLoginView,
    LoginView,
    LogoutView,
    RegistrationView,
    WishlistItemDetailView,
    WishlistView,
)


app_name = "customers"

urlpatterns = [
    path("accounts/register/", RegistrationView.as_view(), name="register"),
    path("accounts/login/", LoginView.as_view(), name="login"),
    path("accounts/google/", GoogleLoginView.as_view(), name="google-login"),
    path("accounts/logout/", LogoutView.as_view(), name="logout"),
    path("accounts/me/", CurrentCustomerView.as_view(), name="me"),
    path("cart/", CartView.as_view(), name="cart"),
    path("cart/items/", CartItemCreateView.as_view(), name="cart-item-create"),
    path("wishlist/", WishlistView.as_view(), name="wishlist"),
    path(
        "wishlist/<int:item_id>/",
        WishlistItemDetailView.as_view(),
        name="wishlist-item-detail",
    ),
    path(
        "cart/items/<int:item_id>/",
        CartItemDetailView.as_view(),
        name="cart-item-detail",
    ),
]
