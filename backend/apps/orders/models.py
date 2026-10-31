from decimal import Decimal, InvalidOperation
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower

from apps.catalogue.models import Product
from apps.customers.models import CustomerAccount


CURRENCY_MINOR_UNIT_MULTIPLIERS = {"GHS": 100}


class DeliveryPricingConfiguration(models.Model):
    class RoundingMode(models.TextChoices):
        HALF_UP = "half_up", "Half up"
        HALF_EVEN = "half_even", "Half even"
        UP = "up", "Away from zero"
        DOWN = "down", "Toward zero"

    version = models.CharField(max_length=40, unique=True)
    is_active = models.BooleanField(default=False)
    base_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
    )
    rate_per_km = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0"))],
    )
    rate_per_kg = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        validators=[MinValueValidator(Decimal("0"))],
    )
    minimum_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
    )
    maximum_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    currency = models.CharField(
        max_length=3,
        choices=[("GHS", "GHS")],
        default="GHS",
    )
    rounding_mode = models.CharField(
        max_length=16,
        choices=RoundingMode.choices,
        default=RoundingMode.HALF_UP,
    )
    review_weight_threshold_kg = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    review_distance_threshold_km = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    review_fee_threshold = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["is_active"],
                condition=Q(is_active=True),
                name="uniq_active_delivery_pricing_config",
            ),
            models.CheckConstraint(
                condition=(
                    Q(maximum_fee__isnull=True)
                    | Q(maximum_fee__gte=F("minimum_fee"))
                ),
                name="delivery_pricing_max_ge_min",
            ),
            models.CheckConstraint(
                condition=Q(base_fee__gte=0),
                name="delivery_pricing_base_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(rate_per_km__gte=0),
                name="delivery_pricing_km_rate_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(rate_per_kg__gte=0),
                name="delivery_pricing_kg_rate_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(minimum_fee__gte=0),
                name="delivery_pricing_min_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(maximum_fee__isnull=True) | Q(maximum_fee__gte=0),
                name="delivery_pricing_max_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(currency="GHS"),
                name="delivery_pricing_currency_ghs",
            ),
            models.CheckConstraint(
                condition=Q(
                    rounding_mode__in=[
                        "half_up",
                        "half_even",
                        "up",
                        "down",
                    ]
                ),
                name="delivery_pricing_rounding_valid",
            ),
            models.CheckConstraint(
                condition=(
                    Q(review_weight_threshold_kg__isnull=True)
                    | Q(review_weight_threshold_kg__gt=0)
                ),
                name="delivery_review_weight_positive",
            ),
            models.CheckConstraint(
                condition=(
                    Q(review_distance_threshold_km__isnull=True)
                    | Q(review_distance_threshold_km__gt=0)
                ),
                name="delivery_review_distance_positive",
            ),
            models.CheckConstraint(
                condition=(
                    Q(review_fee_threshold__isnull=True)
                    | Q(review_fee_threshold__gt=0)
                ),
                name="delivery_review_fee_positive",
            ),
        ]

    def __str__(self):
        return f"Delivery pricing {self.version}"


class DeliveryZone(models.Model):
    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=150)
    city = models.CharField(max_length=100)
    region = models.CharField(max_length=100)
    estimated_distance_km = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.001"))],
        help_text=(
            "Staff-configured estimated route distance from the dispatch point. "
            "Blank requires manual review."
        ),
    )
    legacy_delivery_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        editable=False,
        help_text="Historical zone fee; new quotes use the active pricing formula.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["region", "city", "name", "pk"]
        constraints = [
            models.UniqueConstraint(
                Lower("city"),
                Lower("region"),
                name="uniq_delivery_zone_city_region_ci",
            ),
            models.CheckConstraint(
                condition=(
                    Q(estimated_distance_km__isnull=True)
                    | Q(estimated_distance_km__gt=0)
                ),
                name="delivery_zone_distance_positive",
            ),
            models.CheckConstraint(
                condition=Q(legacy_delivery_fee__gte=0),
                name="delivery_zone_legacy_fee_nonnegative",
            ),
        ]

    def clean(self):
        super().clean()
        self.code = self.code.strip().lower()
        self.name = self.name.strip()
        self.city = self.city.strip()
        self.region = self.region.strip()

    def __str__(self):
        return f"{self.name} ({self.city}, {self.region})"


class DeliverySurcharge(models.Model):
    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=150)
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    zone = models.ForeignKey(
        DeliveryZone,
        related_name="surcharges",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        help_text="Leave blank to apply this surcharge to all delivery zones.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "pk"]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gte=0),
                name="delivery_surcharge_nonnegative",
            ),
        ]

    def __str__(self):
        return self.name


class GhanaRegionalDeliveryRate(models.Model):
    region_code = models.SlugField(max_length=32, unique=True)
    region_name = models.CharField(max_length=80, unique=True)
    version = models.CharField(max_length=40, default="ghana-regions-v1")
    flat_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0"))],
    )
    rate_per_kg = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0"))],
    )
    is_active = models.BooleanField(default=True)
    allow_fallback = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["region_name", "pk"]
        constraints = [
            models.CheckConstraint(
                condition=Q(flat_fee__gte=0),
                name="ghana_region_flat_fee_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(rate_per_kg__gte=0),
                name="ghana_region_weight_rate_nonnegative",
            ),
        ]

    def __str__(self):
        return self.region_name


class AfricanDeliveryCountry(models.Model):
    country_code = models.CharField(max_length=2, unique=True)
    country_name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["country_name", "pk"]

    def __str__(self):
        return self.country_name


class InternationalDeliverySettings(models.Model):
    manual_quotes_enabled = models.BooleanField(default=True)
    instructions = models.CharField(
        max_length=500,
        default="International delivery is quoted manually. No shipping fee is charged until a quotation is confirmed.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "International delivery settings"
        verbose_name_plural = "International delivery settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        settings_obj, _ = cls.objects.get_or_create(pk=1)
        return settings_obj

    def __str__(self):
        return "International delivery settings"


class DeliverySpecialRule(models.Model):
    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=150)
    product_type = models.CharField(
        max_length=24,
        choices=[("", "Any product type"), *Product.ProductType.choices],
        blank=True,
        default="",
    )
    product_name_contains = models.CharField(max_length=100, blank=True, default="")
    minimum_product_weight_kg = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.001"))],
    )
    surcharge_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0"))],
    )
    requires_manual_review = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "pk"]
        constraints = [
            models.CheckConstraint(
                condition=Q(surcharge_amount__gte=0),
                name="delivery_special_surcharge_nonnegative",
            ),
            models.CheckConstraint(
                condition=(
                    Q(minimum_product_weight_kg__isnull=True)
                    | Q(minimum_product_weight_kg__gt=0)
                ),
                name="delivery_special_min_weight_positive",
            ),
        ]

    def clean(self):
        super().clean()
        if not (
            self.product_type
            or self.product_name_contains
            or self.minimum_product_weight_kg is not None
        ):
            raise ValidationError(
                "A special delivery rule must specify at least one product match condition."
            )

    def __str__(self):
        return self.name


class DeliveryQuoteRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In progress"
        QUOTED = "quoted", "Quoted"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        CANCELLED = "cancelled", "Cancelled"

    reference = models.UUIDField(
        default=uuid4,
        primary_key=True,
        editable=False,
    )
    customer = models.ForeignKey(
        CustomerAccount,
        related_name="delivery_quote_requests",
        on_delete=models.PROTECT,
    )
    idempotency_key = models.UUIDField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    reason = models.CharField(max_length=255)
    full_name = models.CharField(max_length=200)
    email = models.EmailField(max_length=254)
    phone = models.CharField(max_length=32)
    address_line_1 = models.CharField(max_length=255)
    address_line_2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    region = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=2)
    postal_code = models.CharField(max_length=24, blank=True)
    items_snapshot = models.JSONField(default=list)
    quoted_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )
    admin_note = models.TextField(blank=True)
    pricing_snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "idempotency_key"],
                name="uniq_delivery_quote_customer_idempotency",
            ),
            models.CheckConstraint(
                condition=Q(quoted_fee__isnull=True) | Q(quoted_fee__gte=0),
                name="delivery_quote_fee_nonnegative",
            ),
        ]

    def __str__(self):
        return f"Delivery quote {self.reference}"


class DeliveryPricingAuditLog(models.Model):
    class ConfigurationType(models.TextChoices):
        PRICING = "pricing", "Pricing configuration"
        ZONE = "zone", "Delivery zone"
        SURCHARGE = "surcharge", "Delivery surcharge"
        REGION = "region", "Ghana regional rate"
        COUNTRY = "country", "African delivery country"
        RULE = "rule", "Special delivery rule"
        INTL_SETTINGS = "intl_settings", "International settings"
        QUOTE_REQUEST = "quote_request", "Delivery quote request"

    class Action(models.TextChoices):
        CREATED = "created", "Created"
        UPDATED = "updated", "Updated"
        DELETED = "deleted", "Deleted"

    configuration_type = models.CharField(
        max_length=16,
        choices=ConfigurationType.choices,
    )
    object_id = models.CharField(max_length=64)
    object_label = models.CharField(max_length=255)
    action = models.CharField(max_length=8, choices=Action.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="delivery_pricing_audit_events",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    before_state = models.JSONField(null=True, blank=True)
    after_state = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-pk"]

    def __str__(self):
        return f"{self.get_action_display()}: {self.object_label}"


def amount_to_minor_units(amount, currency):
    multiplier = CURRENCY_MINOR_UNIT_MULTIPLIERS.get(currency)
    if multiplier is None:
        raise ValueError(f"Unsupported payment currency: {currency}")
    try:
        decimal_amount = Decimal(str(amount))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("Payment amount must be a valid decimal.") from exc
    if not decimal_amount.is_finite():
        raise ValueError("Payment amount must be finite.")
    minor_amount = decimal_amount * multiplier
    if decimal_amount <= 0 or minor_amount != minor_amount.to_integral_value():
        raise ValueError(
            f"{currency} payment amounts must be positive and use "
            f"{len(str(multiplier)) - 1} decimal places or fewer."
        )
    return int(minor_amount)


def generate_payment_reference():
    return f"ws_{uuid4().hex}"


def generate_refund_reference():
    return f"wr_{uuid4().hex}"


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"

    public_reference = models.UUIDField(default=uuid4, unique=True, editable=False)
    customer = models.ForeignKey(
        CustomerAccount,
        related_name="orders",
        on_delete=models.PROTECT,
    )
    idempotency_key = models.UUIDField(null=True, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    payment_status = models.CharField(
        max_length=16,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
    )
    currency = models.CharField(max_length=3, default="GHS")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    delivery_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shipping_full_name = models.CharField(max_length=200)
    shipping_email = models.EmailField(max_length=254)
    shipping_phone = models.CharField(max_length=32)
    shipping_address_line_1 = models.CharField(max_length=255)
    shipping_address_line_2 = models.CharField(max_length=255, blank=True)
    shipping_city = models.CharField(max_length=100)
    shipping_region = models.CharField(max_length=100)
    shipping_postal_code = models.CharField(max_length=24, blank=True)
    shipping_country = models.CharField(max_length=2, default="GH")
    delivery_zone = models.ForeignKey(
        DeliveryZone,
        related_name="orders",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
    )
    delivery_zone_code = models.CharField(max_length=40, blank=True, default="")
    delivery_zone_name = models.CharField(max_length=150, blank=True, default="")
    shipment_weight_kg = models.DecimalField(
        max_digits=12,
        decimal_places=3,
        null=True,
        blank=True,
    )
    estimated_distance_km = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        null=True,
        blank=True,
    )
    delivery_distance_source = models.CharField(max_length=40, blank=True, default="")
    delivery_pricing_snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "idempotency_key"],
                name="uniq_order_customer_idempotency",
            ),
            models.CheckConstraint(
                condition=Q(subtotal__gte=0),
                name="order_subtotal_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(delivery_fee__gte=0),
                name="order_delivery_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(discount__gte=0),
                name="order_discount_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(total__gte=0),
                name="order_total_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(total=F("subtotal") + F("delivery_fee") - F("discount")),
                name="order_total_consistent",
            ),
        ]
        indexes = [
            models.Index(
                fields=["status", "payment_status", "created_at"],
                name="order_expiry_lookup_idx",
            ),
        ]

    def __str__(self):
        return str(self.public_reference)


class Payment(models.Model):
    class Provider(models.TextChoices):
        PAYSTACK = "paystack", "Paystack"

    class Status(models.TextChoices):
        INITIALIZING = "initializing", "Initializing"
        PENDING = "pending", "Pending"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"
        ABANDONED = "abandoned", "Abandoned"
        REFUND_PENDING = "refund_pending", "Refund pending"
        REFUND_REQUIRED = "refund_required", "Refund required"
        REFUNDED = "refunded", "Refunded"
        RECONCILIATION_REQUIRED = (
            "reconciliation_required",
            "Reconciliation required",
        )

    order = models.ForeignKey(
        Order,
        related_name="payments",
        on_delete=models.PROTECT,
    )
    provider = models.CharField(
        max_length=16,
        choices=Provider.choices,
        default=Provider.PAYSTACK,
    )
    reference = models.CharField(
        max_length=64,
        default=generate_payment_reference,
        unique=True,
        editable=False,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    amount_minor = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, choices=[("GHS", "GHS")])
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.INITIALIZING,
    )
    authorization_url = models.URLField(max_length=2048, blank=True)
    idempotency_key = models.UUIDField()
    provider_transaction_id = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    succeeded_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["order", "idempotency_key"],
                name="uniq_payment_order_idempotency",
            ),
            models.UniqueConstraint(
                fields=["order"],
                condition=Q(
                    status__in=[
                        "initializing",
                        "pending",
                    ]
                ),
                name="uniq_order_active_payment",
            ),
            models.UniqueConstraint(
                fields=["provider", "provider_transaction_id"],
                condition=~Q(provider_transaction_id=""),
                name="uniq_payment_provider_transaction",
            ),
            models.CheckConstraint(
                condition=Q(provider="paystack"),
                name="payment_provider_paystack",
            ),
            models.CheckConstraint(
                condition=Q(currency="GHS"),
                name="payment_currency_ghs",
            ),
            models.CheckConstraint(
                condition=Q(
                    status__in=[
                        "initializing",
                        "pending",
                        "succeeded",
                        "failed",
                        "abandoned",
                        "refund_pending",
                        "refund_required",
                        "refunded",
                        "reconciliation_required",
                    ]
                ),
                name="payment_status_valid",
            ),
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name="payment_amount_positive",
            ),
            models.CheckConstraint(
                condition=Q(amount_minor__gt=0),
                name="payment_minor_positive",
            ),
        ]
        indexes = [
            models.Index(
                fields=["provider", "status"],
                name="payment_provider_status_idx",
            ),
            models.Index(
                fields=["order", "created_at"],
                name="order_created_payment_idx",
            ),
        ]

    def clean(self):
        super().clean()
        try:
            expected_minor = amount_to_minor_units(self.amount, self.currency)
        except ValueError as exc:
            raise ValidationError({"amount": str(exc)}) from exc
        if self.amount_minor != expected_minor:
            raise ValidationError(
                {"amount_minor": "Must match the amount and currency snapshot."}
            )

    def __str__(self):
        return self.reference


class PaymentRefund(models.Model):
    class Status(models.TextChoices):
        INITIALIZING = "initializing", "Initializing"
        PENDING = "pending", "Pending"
        PROCESSED = "processed", "Processed"
        RECONCILIATION_REQUIRED = (
            "reconciliation_required",
            "Reconciliation required",
        )

    payment = models.OneToOneField(
        Payment,
        related_name="refund",
        on_delete=models.PROTECT,
    )
    reference = models.CharField(
        max_length=64,
        default=generate_refund_reference,
        unique=True,
        editable=False,
    )
    idempotency_key = models.UUIDField()
    amount_minor = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, choices=[("GHS", "GHS")])
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.INITIALIZING,
    )
    provider_refund_id = models.CharField(max_length=128, blank=True)
    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="payment_refunds",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["provider_refund_id"],
                condition=~Q(provider_refund_id=""),
                name="uniq_provider_refund_id",
            ),
            models.CheckConstraint(
                condition=Q(amount_minor__gt=0),
                name="refund_amount_positive",
            ),
            models.CheckConstraint(
                condition=Q(currency="GHS"),
                name="refund_currency_ghs",
            ),
            models.CheckConstraint(
                condition=Q(
                    status__in=[
                        "initializing",
                        "pending",
                        "processed",
                        "reconciliation_required",
                    ]
                ),
                name="refund_status_valid",
            ),
        ]

    def __str__(self):
        return self.reference


class PaymentEvent(models.Model):
    class ProcessingStatus(models.TextChoices):
        RECEIVED = "received", "Received"
        PROCESSED = "processed", "Processed"
        IGNORED = "ignored", "Ignored"
        FAILED = "failed", "Failed"

    provider = models.CharField(
        max_length=16,
        choices=Payment.Provider.choices,
        default=Payment.Provider.PAYSTACK,
    )
    payment = models.ForeignKey(
        Payment,
        related_name="events",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    deduplication_key = models.CharField(max_length=128)
    event_identifier = models.CharField(max_length=128, blank=True)
    payload_digest = models.CharField(
        max_length=64,
        validators=[RegexValidator(r"^[0-9a-f]{64}$")],
    )
    event_type = models.CharField(max_length=100)
    processing_status = models.CharField(
        max_length=16,
        choices=ProcessingStatus.choices,
        default=ProcessingStatus.RECEIVED,
    )
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-received_at", "-pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "deduplication_key"],
                name="uniq_payment_event_deduplication",
            ),
            models.UniqueConstraint(
                fields=["provider", "event_identifier"],
                condition=~Q(event_identifier=""),
                name="uniq_payment_event_identifier",
            ),
            models.CheckConstraint(
                condition=Q(provider="paystack"),
                name="payment_event_provider_paystack",
            ),
            models.CheckConstraint(
                condition=Q(
                    processing_status__in=[
                        "received",
                        "processed",
                        "ignored",
                        "failed",
                    ]
                ),
                name="payment_event_status_valid",
            ),
        ]
        indexes = [
            models.Index(
                fields=["provider", "received_at"],
                name="payment_event_received_idx",
            ),
        ]

    def __str__(self):
        return f"{self.provider}:{self.deduplication_key}"


class OrderItem(models.Model):
    order = models.ForeignKey(
        Order,
        related_name="items",
        on_delete=models.CASCADE,
    )
    product = models.ForeignKey(
        Product,
        related_name="order_items",
        on_delete=models.PROTECT,
    )
    product_name = models.CharField(max_length=200)
    product_sku = models.CharField(max_length=64)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    line_total = models.DecimalField(max_digits=12, decimal_places=2)
    product_weight_kg = models.DecimalField(
        max_digits=10,
        decimal_places=3,
        null=True,
        blank=True,
    )
    reservation_key = models.UUIDField(default=uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["pk"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0),
                name="order_item_quantity_positive",
            ),
            models.CheckConstraint(
                condition=Q(unit_price__gte=0),
                name="order_item_unit_price_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(line_total__gte=0),
                name="order_item_total_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(line_total=F("unit_price") * F("quantity")),
                name="order_item_total_consistent",
            ),
            models.CheckConstraint(
                condition=Q(product_weight_kg__isnull=True)
                | Q(product_weight_kg__gt=0),
                name="order_item_weight_positive_or_unknown",
            ),
        ]

    def __str__(self):
        return f"{self.product_sku} x {self.quantity}"
