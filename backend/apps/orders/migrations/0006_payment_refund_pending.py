from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0005_order_expiration"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="payment",
            name="payment_status_valid",
        ),
        migrations.AlterField(
            model_name="payment",
            name="status",
            field=models.CharField(
                choices=[
                    ("initializing", "Initializing"),
                    ("pending", "Pending"),
                    ("succeeded", "Succeeded"),
                    ("failed", "Failed"),
                    ("abandoned", "Abandoned"),
                    ("refund_pending", "Refund pending"),
                    ("refund_required", "Refund required"),
                    ("refunded", "Refunded"),
                    ("reconciliation_required", "Reconciliation required"),
                ],
                default="initializing",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="payment",
            name="refunded_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.CheckConstraint(
                condition=models.Q(
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
                    ],
                ),
                name="payment_status_valid",
            ),
        ),
    ]
