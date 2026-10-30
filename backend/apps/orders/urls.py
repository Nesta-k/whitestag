from django.urls import path

from .views import (
    CheckoutView,
    CustomerOrderListView,
    DeliveryQuoteView,
    DeliveryZoneListView,
    OrderCancelView,
    OrderDetailView,
    OrderPaymentInitializationView,
    PaystackWebhookView,
    PaymentVerificationView,
    StaffOrderCompleteView,
    StaffDashboardOverviewView,
    StaffDeliveryPricingView,
    StaffOrderListView,
    StaffPaymentListView,
    StaffPaymentRefundView,
    SuperuserDeliveryPricingAuditListView,
    SuperuserDeliverySurchargeDetailView,
    SuperuserDeliverySurchargeListCreateView,
    SuperuserDeliveryZoneDetailView,
    SuperuserDeliveryZoneListCreateView,
    SuperuserPricingConfigurationDetailView,
    SuperuserPricingConfigurationListCreateView,
)


app_name = "orders"

urlpatterns = [
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("delivery-zones/", DeliveryZoneListView.as_view(), name="delivery-zone-list"),
    path("delivery-quote/", DeliveryQuoteView.as_view(), name="delivery-quote"),
    path(
        "staff/dashboard/",
        StaffDashboardOverviewView.as_view(),
        name="staff-dashboard",
    ),
    path("staff/payments/", StaffPaymentListView.as_view(), name="staff-payments"),
    path(
        "staff/delivery-pricing/",
        StaffDeliveryPricingView.as_view(),
        name="staff-delivery-pricing",
    ),
    path(
        "superadmin/delivery-pricing/configurations/",
        SuperuserPricingConfigurationListCreateView.as_view(),
        name="superadmin-pricing-configuration-list",
    ),
    path(
        "superadmin/delivery-pricing/configurations/<int:pk>/",
        SuperuserPricingConfigurationDetailView.as_view(),
        name="superadmin-pricing-configuration-detail",
    ),
    path(
        "superadmin/delivery-pricing/zones/",
        SuperuserDeliveryZoneListCreateView.as_view(),
        name="superadmin-delivery-zone-list",
    ),
    path(
        "superadmin/delivery-pricing/zones/<int:pk>/",
        SuperuserDeliveryZoneDetailView.as_view(),
        name="superadmin-delivery-zone-detail",
    ),
    path(
        "superadmin/delivery-pricing/surcharges/",
        SuperuserDeliverySurchargeListCreateView.as_view(),
        name="superadmin-delivery-surcharge-list",
    ),
    path(
        "superadmin/delivery-pricing/surcharges/<int:pk>/",
        SuperuserDeliverySurchargeDetailView.as_view(),
        name="superadmin-delivery-surcharge-detail",
    ),
    path(
        "superadmin/delivery-pricing/audit/",
        SuperuserDeliveryPricingAuditListView.as_view(),
        name="superadmin-delivery-pricing-audit",
    ),
    path(
        "payments/paystack/webhook/",
        PaystackWebhookView.as_view(),
        name="paystack-webhook",
    ),
    path("", CustomerOrderListView.as_view(), name="list"),
    path("staff/", StaffOrderListView.as_view(), name="staff-list"),
    path(
        "staff/<uuid:public_reference>/complete/",
        StaffOrderCompleteView.as_view(),
        name="staff-complete",
    ),
    path(
        "staff/payments/<str:payment_reference>/refunds/",
        StaffPaymentRefundView.as_view(),
        name="staff-payment-refund",
    ),
    path(
        "payments/<str:payment_reference>/verify/",
        PaymentVerificationView.as_view(),
        name="payment-verify",
    ),
    path(
        "<uuid:public_reference>/payments/",
        OrderPaymentInitializationView.as_view(),
        name="payment-initialize",
    ),
    path("<uuid:public_reference>/", OrderDetailView.as_view(), name="detail"),
    path(
        "<uuid:public_reference>/cancel/",
        OrderCancelView.as_view(),
        name="cancel",
    ),
]
