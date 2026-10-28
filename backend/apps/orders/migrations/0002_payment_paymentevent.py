import apps.orders.models
import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Payment",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "provider",
                    models.CharField(
                        choices=[("paystack", "Paystack")],
                        default="paystack",
                        max_length=16,
                    ),
                ),
                (
                    "reference",
                    models.CharField(
                        default=apps.orders.models.generate_payment_reference,
                        editable=False,
                        max_length=64,
                        unique=True,
                    ),
                ),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("amount_minor", models.PositiveBigIntegerField()),
                ("currency", models.CharField(choices=[("GHS", "GHS")], max_length=3)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("initializing", "Initializing"),
                            ("pending", "Pending"),
                            ("succeeded", "Succeeded"),
                            ("failed", "Failed"),
                            ("abandoned", "Abandoned"),
                            ("refund_required", "Refund required"),
                            ("refunded", "Refunded"),
                            (
                                "reconciliation_required",
                                "Reconciliation required",
                            ),
                        ],
                        default="initializing",
                        max_length=32,
                    ),
                ),
                ("idempotency_key", models.UUIDField()),
                ("provider_transaction_id", models.CharField(blank=True, max_length=128)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("succeeded_at", models.DateTimeField(blank=True, null=True)),
                (
                    "order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="payments",
                        to="orders.order",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-pk"],
            },
        ),
        migrations.CreateModel(
            name="PaymentEvent",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "provider",
                    models.CharField(
                        choices=[("paystack", "Paystack")],
                        default="paystack",
                        max_length=16,
                    ),
                ),
                ("deduplication_key", models.CharField(max_length=128)),
                ("event_identifier", models.CharField(blank=True, max_length=128)),
                (
                    "payload_digest",
                    models.CharField(
                        max_length=64,
                        validators=[
                            django.core.validators.RegexValidator(r"^[0-9a-f]{64}$")
                        ],
                    ),
                ),
                ("event_type", models.CharField(max_length=100)),
                (
                    "processing_status",
                    models.CharField(
                        choices=[
                            ("received", "Received"),
                            ("processed", "Processed"),
                            ("ignored", "Ignored"),
                            ("failed", "Failed"),
                        ],
                        default="received",
                        max_length=16,
                    ),
                ),
                ("received_at", models.DateTimeField(auto_now_add=True)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "payment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="events",
                        to="orders.payment",
                    ),
                ),
            ],
            options={
                "ordering": ["-received_at", "-pk"],
            },
        ),
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.UniqueConstraint(
                fields=("order", "idempotency_key"),
                name="uniq_payment_order_idempotency",
            ),
        ),
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    (
                        "status__in",
                        [
                            "initializing",
                            "pending",
                            "succeeded",
                            "refund_required",
                            "refunded",
                            "reconciliation_required",
                        ],
                    )
                ),
                fields=("order",),
                name="uniq_order_unresolved_payment",
            ),
        ),
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("provider_transaction_id", ""),
                    _negated=True,
                ),
                fields=("provider", "provider_transaction_id"),
                name="uniq_payment_provider_transaction",
            ),
        ),
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.CheckConstraint(
                condition=models.Q(("provider", "paystack")),
                name="payment_provider_paystack",
            ),
        ),
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.CheckConstraint(
                condition=models.Q(("currency", "GHS")),
                name="payment_currency_ghs",
            ),
        ),
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    (
                        "status__in",
                        [
                            "initializing",
                            "pending",
                            "succeeded",
                            "failed",
                            "abandoned",
                            "refund_required",
                            "refunded",
                            "reconciliation_required",
                        ],
                    )
                ),
                name="payment_status_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.CheckConstraint(
                condition=models.Q(("amount__gt", 0)),
                name="payment_amount_positive",
            ),
        ),
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.CheckConstraint(
                condition=models.Q(("amount_minor__gt", 0)),
                name="payment_minor_positive",
            ),
        ),
        migrations.AddConstraint(
            model_name="paymentevent",
            constraint=models.UniqueConstraint(
                fields=("provider", "deduplication_key"),
                name="uniq_payment_event_deduplication",
            ),
        ),
        migrations.AddConstraint(
            model_name="paymentevent",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("event_identifier", ""),
                    _negated=True,
                ),
                fields=("provider", "event_identifier"),
                name="uniq_payment_event_identifier",
            ),
        ),
        migrations.AddConstraint(
            model_name="paymentevent",
            constraint=models.CheckConstraint(
                condition=models.Q(("provider", "paystack")),
                name="payment_event_provider_paystack",
            ),
        ),
        migrations.AddConstraint(
            model_name="paymentevent",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    (
                        "processing_status__in",
                        ["received", "processed", "ignored", "failed"],
                    )
                ),
                name="payment_event_status_valid",
            ),
        ),
        migrations.AddIndex(
            model_name="payment",
            index=models.Index(
                fields=["provider", "status"],
                name="payment_provider_status_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="payment",
            index=models.Index(
                fields=["order", "created_at"],
                name="order_created_payment_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="paymentevent",
            index=models.Index(
                fields=["provider", "received_at"],
                name="payment_event_received_idx",
            ),
        ),
    ]
