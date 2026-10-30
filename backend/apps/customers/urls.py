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
    StaffLoginView,
    StaffCustomerListView,
    StaffMeView,
    SuperuserAccountDetailView,
    SuperuserAccountListCreateView,
    WishlistItemDetailView,
    WishlistView,
)


app_name = "customers"

urlpatterns = [
    path("accounts/register/", RegistrationView.as_view(), name="register"),
    path("accounts/login/", LoginView.as_view(), name="login"),
    path("accounts/staff-login/", StaffLoginView.as_view(), name="staff-login"),
    path("accounts/staff/me/", StaffMeView.as_view(), name="staff-me"),
    path(
        "superadmin/users/",
        SuperuserAccountListCreateView.as_view(),
        name="superadmin-user-list",
    ),
    path(
        "superadmin/users/<int:pk>/",
        SuperuserAccountDetailView.as_view(),
        name="superadmin-user-detail",
    ),
    path("accounts/google/", GoogleLoginView.as_view(), name="google-login"),
    path("accounts/logout/", LogoutView.as_view(), name="logout"),
    path("accounts/me/", CurrentCustomerView.as_view(), name="me"),
    path("cart/", CartView.as_view(), name="cart"),
    path("cart/items/", CartItemCreateView.as_view(), name="cart-item-create"),
    path("wishlist/", WishlistView.as_view(), name="wishlist"),
    path("staff/customers/", StaffCustomerListView.as_view(), name="staff-customer-list"),
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
