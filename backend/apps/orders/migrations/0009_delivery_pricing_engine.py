import decimal

import django.conf
import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalogue", "0002_product_weight"),
        ("orders", "0008_deliveryzone_order_snapshots"),
        migrations.swappable_dependency(
            django.conf.settings.AUTH_USER_MODEL
        ),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="deliveryzone",
            name="delivery_zone_fee_nonnegative",
        ),
        migrations.RenameField(
            model_name="deliveryzone",
            old_name="delivery_fee",
            new_name="legacy_delivery_fee",
        ),
        migrations.AlterField(
            model_name="deliveryzone",
            name="legacy_delivery_fee",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                editable=False,
                help_text=(
                    "Historical zone fee; new quotes use the active pricing "
                    "formula."
                ),
                max_digits=12,
            ),
        ),
        migrations.AddConstraint(
            model_name="deliveryzone",
            constraint=models.CheckConstraint(
                condition=models.Q(("legacy_delivery_fee__gte", 0)),
                name="delivery_zone_legacy_fee_nonnegative",
            ),
        ),
        migrations.AddField(
            model_name="deliveryzone",
            name="estimated_distance_km",
            field=models.DecimalField(
                blank=True,
                decimal_places=3,
                help_text=(
                    "Staff-configured estimated route distance from the dispatch "
                    "point. Blank requires manual review."
                ),
                max_digits=10,
                null=True,
                validators=[
                    django.core.validators.MinValueValidator(
                        decimal.Decimal("0.001")
                    )
                ],
            ),
        ),
        migrations.AddConstraint(
            model_name="deliveryzone",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("estimated_distance_km__isnull", True),
                    ("estimated_distance_km__gt", 0),
                    _connector="OR",
                ),
                name="delivery_zone_distance_positive",
            ),
        ),
        migrations.CreateModel(
            name="DeliveryPricingConfiguration",
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
                ("version", models.CharField(max_length=40, unique=True)),
                ("is_active", models.BooleanField(default=False)),
                (
                    "base_fee",
                    models.DecimalField(
                        decimal_places=2,
                        max_digits=12,
                        validators=[
                            django.core.validators.MinValueValidator(
                                decimal.Decimal("0")
                            )
                        ],
                    ),
                ),
                (
                    "rate_per_km",
                    models.DecimalField(
                        decimal_places=4,
                        max_digits=12,
                        validators=[
                            django.core.validators.MinValueValidator(
                                decimal.Decimal("0")
                            )
                        ],
                    ),
                ),
                (
                    "rate_per_kg",
                    models.DecimalField(
                        decimal_places=4,
                        max_digits=12,
                        validators=[
                            django.core.validators.MinValueValidator(
                                decimal.Decimal("0")
                            )
                        ],
                    ),
                ),
                (
                    "minimum_fee",
                    models.DecimalField(
                        decimal_places=2,
                        max_digits=12,
                        validators=[
                            django.core.validators.MinValueValidator(
                                decimal.Decimal("0")
                            )
                        ],
                    ),
                ),
                (
                    "maximum_fee",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        max_digits=12,
                        null=True,
                        validators=[
                            django.core.validators.MinValueValidator(
                                decimal.Decimal("0")
                            )
                        ],
                    ),
                ),
                (
                    "currency",
                    models.CharField(
                        choices=[("GHS", "GHS")],
                        default="GHS",
                        max_length=3,
                    ),
                ),
                (
                    "rounding_mode",
                    models.CharField(
                        choices=[
                            ("half_up", "Half up"),
                            ("half_even", "Half even"),
                            ("up", "Away from zero"),
                            ("down", "Toward zero"),
                        ],
                        default="half_up",
                        max_length=16,
                    ),
                ),
                (
                    "review_weight_threshold_kg",
                    models.DecimalField(
                        blank=True,
                        decimal_places=3,
                        max_digits=10,
                        null=True,
                        validators=[
                            django.core.validators.MinValueValidator(
                                decimal.Decimal("0.001")
                            )
                        ],
                    ),
                ),
                (
                    "review_distance_threshold_km",
                    models.DecimalField(
                        blank=True,
                        decimal_places=3,
                        max_digits=10,
                        null=True,
                        validators=[
                            django.core.validators.MinValueValidator(
                                decimal.Decimal("0.001")
                            )
                        ],
                    ),
                ),
                (
                    "review_fee_threshold",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        max_digits=12,
                        null=True,
                        validators=[
                            django.core.validators.MinValueValidator(
                                decimal.Decimal("0.01")
                            )
                        ],
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.AddConstraint(
            model_name="deliverypricingconfiguration",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_active", True)),
                fields=("is_active",),
                name="uniq_active_delivery_pricing_config",
            ),
        ),
        migrations.AddConstraint(
            model_name="deliverypricingconfiguration",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("maximum_fee__isnull", True),
                    ("maximum_fee__gte", models.F("minimum_fee")),
                    _connector="OR",
                ),
                name="delivery_pricing_max_ge_min",
            ),
        ),
        migrations.AddConstraint(
            model_name="deliverypricingconfiguration",
            constraint=models.CheckConstraint(
                condition=models.Q(("base_fee__gte", 0)),
                name="delivery_pricing_base_nonnegative",
            ),
        ),
        migrations.AddConstraint(
            model_name="deliverypricingconfiguration",
            constraint=models.CheckConstraint(
                condition=models.Q(("rate_per_km__gte", 0)),
                name="delivery_pricing_km_rate_nonnegative",
            ),
        ),
        migrations.AddConstraint(
            model_name="deliverypricingconfiguration",
            constraint=models.CheckConstraint(
                condition=models.Q(("rate_per_kg__gte", 0)),
                name="delivery_pricing_kg_rate_nonnegative",
            ),
        ),
        migrations.AddConstraint(
            model_name="deliverypricingconfiguration",
            constraint=models.CheckConstraint(
                condition=models.Q(("minimum_fee__gte", 0)),
                name="delivery_pricing_min_nonnegative",
            ),
        ),
        migrations.AddConstraint(
            model_name="deliverypricingconfiguration",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("maximum_fee__isnull", True),
                    ("maximum_fee__gte", 0),
                    _connector="OR",
                ),
                name="delivery_pricing_max_nonnegative",
            ),
        ),
        migrations.AddConstraint(
            model_name="deliverypricingconfiguration",
            constraint=models.CheckConstraint(
                condition=models.Q(("currency", "GHS")),
                name="delivery_pricing_currency_ghs",
            ),
        ),
        migrations.AddConstraint(
            model_name="deliverypricingconfiguration",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    (
                        "rounding_mode__in",
                        ["half_up", "half_even", "up", "down"],
                    )
                ),
                name="delivery_pricing_rounding_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="deliverypricingconfiguration",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("review_weight_threshold_kg__isnull", True),
                    ("review_weight_threshold_kg__gt", 0),
                    _connector="OR",
                ),
                name="delivery_review_weight_positive",
            ),
        ),
        migrations.AddConstraint(
            model_name="deliverypricingconfiguration",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("review_distance_threshold_km__isnull", True),
                    ("review_distance_threshold_km__gt", 0),
                    _connector="OR",
                ),
                name="delivery_review_distance_positive",
            ),
        ),
        migrations.AddConstraint(
            model_name="deliverypricingconfiguration",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("review_fee_threshold__isnull", True),
                    ("review_fee_threshold__gt", 0),
                    _connector="OR",
                ),
                name="delivery_review_fee_positive",
            ),
        ),
        migrations.CreateModel(
            name="DeliverySurcharge",
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
                (
                    "amount",
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
                (
                    "zone",
                    models.ForeignKey(
                        blank=True,
                        help_text=(
                            "Leave blank to apply this surcharge to all delivery "
                            "zones."
                        ),
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="surcharges",
                        to="orders.deliveryzone",
                    ),
                ),
            ],
            options={"ordering": ["name", "pk"]},
        ),
        migrations.AddConstraint(
            model_name="deliverysurcharge",
            constraint=models.CheckConstraint(
                condition=models.Q(("amount__gte", 0)),
                name="delivery_surcharge_nonnegative",
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="shipment_weight_kg",
            field=models.DecimalField(
                blank=True,
                decimal_places=3,
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="estimated_distance_km",
            field=models.DecimalField(
                blank=True,
                decimal_places=3,
                max_digits=10,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_distance_source",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_pricing_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="orderitem",
            name="product_weight_kg",
            field=models.DecimalField(
                blank=True,
                decimal_places=3,
                max_digits=10,
                null=True,
            ),
        ),
        migrations.AddConstraint(
            model_name="orderitem",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("product_weight_kg__isnull", True),
                    ("product_weight_kg__gt", 0),
                    _connector="OR",
                ),
                name="order_item_weight_positive_or_unknown",
            ),
        ),
        migrations.CreateModel(
            name="DeliveryPricingAuditLog",
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
                    "configuration_type",
                    models.CharField(
                        choices=[
                            ("pricing", "Pricing configuration"),
                            ("zone", "Delivery zone"),
                            ("surcharge", "Delivery surcharge"),
                        ],
                        max_length=16,
                    ),
                ),
                ("object_id", models.CharField(max_length=64)),
                ("object_label", models.CharField(max_length=255)),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("created", "Created"),
                            ("updated", "Updated"),
                            ("deleted", "Deleted"),
                        ],
                        max_length=8,
                    ),
                ),
                ("before_state", models.JSONField(blank=True, null=True)),
                ("after_state", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="delivery_pricing_audit_events",
                        to=django.conf.settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-created_at", "-pk"]},
        ),
    ]
