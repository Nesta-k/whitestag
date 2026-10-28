from rest_framework.permissions import BasePermission


class HasCustomerAccount(BasePermission):
    message = "A registered customer account is required."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and hasattr(request.user, "customer_account")
        )
