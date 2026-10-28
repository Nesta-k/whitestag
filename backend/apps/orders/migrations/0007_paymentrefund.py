import apps.orders.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0006_payment_refund_pending"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PaymentRefund",
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
                    "reference",
                    models.CharField(
                        default=apps.orders.models.generate_refund_reference,
                        editable=False,
                        max_length=64,
                        unique=True,
                    ),
                ),
                ("idempotency_key", models.UUIDField()),
                ("amount_minor", models.PositiveBigIntegerField()),
                (
                    "currency",
                    models.CharField(choices=[("GHS", "GHS")], max_length=3),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("initializing", "Initializing"),
                            ("pending", "Pending"),
                            ("processed", "Processed"),
                            (
                                "reconciliation_required",
                                "Reconciliation required",
                            ),
                        ],
                        default="initializing",
                        max_length=32,
                    ),
                ),
                ("provider_refund_id", models.CharField(blank=True, max_length=128)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "initiated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="payment_refunds",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "payment",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="refund",
                        to="orders.payment",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-pk"],
            },
        ),
        migrations.AddConstraint(
            model_name="paymentrefund",
            constraint=models.UniqueConstraint(
                condition=models.Q(("provider_refund_id", ""), _negated=True),
                fields=("provider_refund_id",),
                name="uniq_provider_refund_id",
            ),
        ),
        migrations.AddConstraint(
            model_name="paymentrefund",
            constraint=models.CheckConstraint(
                condition=models.Q(("amount_minor__gt", 0)),
                name="refund_amount_positive",
            ),
        ),
        migrations.AddConstraint(
            model_name="paymentrefund",
            constraint=models.CheckConstraint(
                condition=models.Q(("currency", "GHS")),
                name="refund_currency_ghs",
            ),
        ),
        migrations.AddConstraint(
            model_name="paymentrefund",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    (
                        "status__in",
                        [
                            "initializing",
                            "pending",
                            "processed",
                            "reconciliation_required",
                        ],
                    )
                ),
                name="refund_status_valid",
            ),
        ),
    ]
