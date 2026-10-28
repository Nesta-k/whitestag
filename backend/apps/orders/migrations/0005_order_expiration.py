from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0004_active_payment_constraint"),
    ]

    operations = [
        migrations.AlterField(
            model_name="order",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("processing", "Processing"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                    ("expired", "Expired"),
                ],
                default="pending",
                max_length=16,
            ),
        ),
        migrations.AddIndex(
            model_name="order",
            index=models.Index(
                fields=["status", "payment_status", "created_at"],
                name="order_expiry_lookup_idx",
            ),
        ),
    ]
