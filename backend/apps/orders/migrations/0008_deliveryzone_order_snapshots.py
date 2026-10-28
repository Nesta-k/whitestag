import decimal

import django.core.validators
import django.db.models.deletion
import django.db.models.functions.text
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0007_paymentrefund"),
    ]

    operations = [
        migrations.CreateModel(
            name="DeliveryZone",
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
                ("code", models.SlugField(max_length=40, unique=True)),
                ("name", models.CharField(max_length=150)),
                ("city", models.CharField(max_length=100)),
                ("region", models.CharField(max_length=100)),
                (
                    "delivery_fee",
                    models.DecimalField(
                        decimal_places=2,
                        max_digits=12,
                        validators=[
                            django.core.validators.MinValueValidator(
                                decimal.Decimal("0.00")
                            )
                        ],
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["region", "city", "name", "pk"],
                "constraints": [
                    models.UniqueConstraint(
                        django.db.models.functions.text.Lower("city"),
                        django.db.models.functions.text.Lower("region"),
                        name="uniq_delivery_zone_city_region_ci",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("delivery_fee__gte", 0)),
                        name="delivery_zone_fee_nonnegative",
                    ),
                ],
            },
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_zone",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="orders",
                to="orders.deliveryzone",
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_zone_code",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_zone_name",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
    ]
