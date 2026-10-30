from rest_framework.permissions import BasePermission

from .models import UserProfile, get_user_role


class HasCustomerAccount(BasePermission):
    message = "A registered customer account is required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and hasattr(request.user, "customer_account")
        )


class IsSuperadmin(BasePermission):
    """Access restricted exclusively to the developer (Superadmin)."""
    message = "Superadmin (Developer) access is required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_active
            and (
                request.user.is_superuser
                or get_user_role(request.user) == UserProfile.Role.SUPERADMIN
            )
        )


# Alias for backward compatibility
IsSuperuser = IsSuperadmin


class IsAdminOrSuperadmin(BasePermission):
    """Access allowed for the business owner (Admin) and developer (Superadmin)."""
    message = "Admin (Owner) or Superadmin (Developer) access is required."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated and request.user.is_active):
            return False
        role = get_user_role(request.user)
        return (
            role in (UserProfile.Role.ADMIN, UserProfile.Role.SUPERADMIN)
            or request.user.is_superuser
        )


class IsStaffOrAbove(BasePermission):
    """Access allowed for Staff, Admin (Owner), and Superadmin (Developer)."""
    message = "Staff or administrative access is required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_active
            and request.user.is_staff
        )

