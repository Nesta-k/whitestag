import decimal
import uuid

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


GHANA_REGIONS = [
    ("greater-accra", "Greater Accra", "50.00"),
    ("eastern", "Eastern", "90.00"),
    ("central", "Central", "100.00"),
    ("ashanti", "Ashanti", "130.00"),
    ("volta", "Volta", "140.00"),
    ("western", "Western", "160.00"),
    ("bono", "Bono", "180.00"),
    ("bono-east", "Bono East", "190.00"),
    ("western-north", "Western North", "200.00"),
    ("ahafo", "Ahafo", "200.00"),
    ("oti", "Oti", "220.00"),
    ("northern", "Northern", "280.00"),
    ("upper-east", "Upper East", "330.00"),
    ("upper-west", "Upper West", "350.00"),
    ("savannah", "Savannah", "320.00"),
    ("north-east", "North East", "330.00"),
]

AFRICAN_COUNTRIES = [
    ("DZ", "Algeria"), ("AO", "Angola"), ("BJ", "Benin"),
    ("BW", "Botswana"), ("BF", "Burkina Faso"), ("BI", "Burundi"),
    ("CV", "Cabo Verde"), ("CM", "Cameroon"), ("CF", "Central African Republic"),
    ("TD", "Chad"), ("KM", "Comoros"), ("CG", "Congo"),
    ("CD", "Democratic Republic of the Congo"), ("CI", "Côte d'Ivoire"),
    ("DJ", "Djibouti"), ("EG", "Egypt"), ("GQ", "Equatorial Guinea"),
    ("ER", "Eritrea"), ("SZ", "Eswatini"), ("ET", "Ethiopia"),
    ("GA", "Gabon"), ("GM", "Gambia"), ("GH", "Ghana"),
    ("GN", "Guinea"), ("GW", "Guinea-Bissau"), ("KE", "Kenya"),
    ("LS", "Lesotho"), ("LR", "Liberia"), ("LY", "Libya"),
    ("MG", "Madagascar"), ("MW", "Malawi"), ("ML", "Mali"),
    ("MR", "Mauritania"), ("MU", "Mauritius"), ("MA", "Morocco"),
    ("MZ", "Mozambique"), ("NA", "Namibia"), ("NE", "Niger"),
    ("NG", "Nigeria"), ("RW", "Rwanda"), ("ST", "Sao Tome and Principe"),
    ("SN", "Senegal"), ("SC", "Seychelles"), ("SL", "Sierra Leone"),
    ("SO", "Somalia"), ("ZA", "South Africa"), ("SS", "South Sudan"),
    ("SD", "Sudan"), ("TZ", "Tanzania"), ("TG", "Togo"),
    ("TN", "Tunisia"), ("UG", "Uganda"), ("ZM", "Zambia"),
    ("ZW", "Zimbabwe"),
]


def seed_delivery_options(apps, schema_editor):
    RegionRate = apps.get_model("orders", "GhanaRegionalDeliveryRate")
    Country = apps.get_model("orders", "AfricanDeliveryCountry")
    Settings = apps.get_model("orders", "InternationalDeliverySettings")
    Rule = apps.get_model("orders", "DeliverySpecialRule")

    for code, name, fee in GHANA_REGIONS:
        RegionRate.objects.get_or_create(
            region_code=code,
            defaults={
                "region_name": name,
                "version": "ghana-regions-v1",
                "flat_fee": decimal.Decimal(fee),
                "rate_per_kg": decimal.Decimal("0"),
                "is_active": True,
                "allow_fallback": False,
            },
        )
    for code, name in AFRICAN_COUNTRIES:
        Country.objects.get_or_create(
            country_code=code,
            defaults={"country_name": name, "is_active": True},
        )
    Settings.objects.get_or_create(pk=1)

    rules = [
        ("vehicle-car", "Vehicle transport quotation", "car", "", None),
        ("vehicle-electric", "Electric vehicle transport quotation", "electric_vehicle", "", None),
        ("vehicle-tricycle", "Tricycle transport quotation", "tricycle", "", None),
        ("vehicle-motorcycle", "Motorcycle transport quotation", "motorcycle_bike", "", None),
        ("heavy-products", "Heavy product review", "", "", decimal.Decimal("30")),
        ("ev-battery", "EV battery shipping assessment", "", "battery", None),
    ]
    for code, name, product_type, name_match, minimum_weight in rules:
        Rule.objects.get_or_create(
            code=code,
            defaults={
                "name": name,
                "product_type": product_type,
                "product_name_contains": name_match,
                "minimum_product_weight_kg": minimum_weight,
                "surcharge_amount": decimal.Decimal("0"),
                "requires_manual_review": True,
                "is_active": True,
            },
        )


def unseed_delivery_options(apps, schema_editor):
    for model_name in (
        "DeliverySpecialRule",
        "InternationalDeliverySettings",
        "AfricanDeliveryCountry",
        "GhanaRegionalDeliveryRate",
    ):
        apps.get_model("orders", model_name).objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0009_delivery_pricing_engine"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("customers", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="AfricanDeliveryCountry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("country_code", models.CharField(max_length=2, unique=True)),
                ("country_name", models.CharField(max_length=100, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["country_name", "pk"]},
        ),
        migrations.CreateModel(
            name="DeliverySpecialRule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.SlugField(max_length=40, unique=True)),
                ("name", models.CharField(max_length=150)),
                ("product_type", models.CharField(blank=True, choices=[("", "Any product type"), ("spare_part", "Spare part"), ("car", "Car"), ("electric_vehicle", "Electric vehicle"), ("tricycle", "Motorized tricycle"), ("motorcycle_bike", "Motorcycle or bike"), ("other", "Other")], default="", max_length=24)),
                ("product_name_contains", models.CharField(blank=True, default="", max_length=100)),
                ("minimum_product_weight_kg", models.DecimalField(blank=True, decimal_places=3, max_digits=10, null=True, validators=[django.core.validators.MinValueValidator(decimal.Decimal("0.001"))])),
                ("surcharge_amount", models.DecimalField(decimal_places=2, default=decimal.Decimal("0"), max_digits=12, validators=[django.core.validators.MinValueValidator(decimal.Decimal("0"))])),
                ("requires_manual_review", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["name", "pk"]},
        ),
        migrations.CreateModel(
            name="GhanaRegionalDeliveryRate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("region_code", models.SlugField(max_length=32, unique=True)),
                ("region_name", models.CharField(max_length=80, unique=True)),
                ("version", models.CharField(default="ghana-regions-v1", max_length=40)),
                ("flat_fee", models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(decimal.Decimal("0"))])),
                ("rate_per_kg", models.DecimalField(decimal_places=4, default=decimal.Decimal("0"), max_digits=12, validators=[django.core.validators.MinValueValidator(decimal.Decimal("0"))])),
                ("is_active", models.BooleanField(default=True)),
                ("allow_fallback", models.BooleanField(default=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["region_name", "pk"]},
        ),
        migrations.CreateModel(
            name="InternationalDeliverySettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("manual_quotes_enabled", models.BooleanField(default=True)),
                ("instructions", models.CharField(default="International delivery is quoted manually. No shipping fee is charged until a quotation is confirmed.", max_length=500)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"verbose_name": "International delivery settings", "verbose_name_plural": "International delivery settings"},
        ),
        migrations.CreateModel(
            name="DeliveryQuoteRequest",
            fields=[
                ("reference", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("idempotency_key", models.UUIDField()),
                ("status", models.CharField(choices=[("pending", "Pending"), ("in_progress", "In progress"), ("quoted", "Quoted"), ("accepted", "Accepted"), ("declined", "Declined"), ("cancelled", "Cancelled")], default="pending", max_length=16)),
                ("reason", models.CharField(max_length=255)),
                ("full_name", models.CharField(max_length=200)),
                ("email", models.EmailField(max_length=254)),
                ("phone", models.CharField(max_length=32)),
                ("address_line_1", models.CharField(max_length=255)),
                ("address_line_2", models.CharField(blank=True, max_length=255)),
                ("city", models.CharField(max_length=100)),
                ("region", models.CharField(blank=True, max_length=100)),
                ("country", models.CharField(max_length=2)),
                ("postal_code", models.CharField(blank=True, max_length=24)),
                ("items_snapshot", models.JSONField(default=list)),
                ("quoted_fee", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True, validators=[django.core.validators.MinValueValidator(decimal.Decimal("0"))])),
                ("admin_note", models.TextField(blank=True)),
                ("pricing_snapshot", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="delivery_quote_requests", to="customers.customeraccount")),
            ],
            options={"ordering": ["-created_at", "-pk"]},
        ),
        migrations.AddConstraint(
            model_name="deliveryspecialrule",
            constraint=models.CheckConstraint(condition=models.Q(("surcharge_amount__gte", 0)), name="delivery_special_surcharge_nonnegative"),
        ),
        migrations.AddConstraint(
            model_name="deliveryspecialrule",
            constraint=models.CheckConstraint(condition=models.Q(("minimum_product_weight_kg__isnull", True), ("minimum_product_weight_kg__gt", 0), _connector="OR"), name="delivery_special_min_weight_positive"),
        ),
        migrations.AddConstraint(
            model_name="ghanaregionaldeliveryrate",
            constraint=models.CheckConstraint(condition=models.Q(("flat_fee__gte", 0)), name="ghana_region_flat_fee_nonnegative"),
        ),
        migrations.AddConstraint(
            model_name="ghanaregionaldeliveryrate",
            constraint=models.CheckConstraint(condition=models.Q(("rate_per_kg__gte", 0)), name="ghana_region_weight_rate_nonnegative"),
        ),
        migrations.AddConstraint(
            model_name="deliveryquoterequest",
            constraint=models.UniqueConstraint(fields=("customer", "idempotency_key"), name="uniq_delivery_quote_customer_idempotency"),
        ),
        migrations.AddConstraint(
            model_name="deliveryquoterequest",
            constraint=models.CheckConstraint(condition=models.Q(("quoted_fee__isnull", True), ("quoted_fee__gte", 0), _connector="OR"), name="delivery_quote_fee_nonnegative"),
        ),
        migrations.AlterField(
            model_name="deliverypricingauditlog",
            name="configuration_type",
            field=models.CharField(
                choices=[
                    ("pricing", "Pricing configuration"),
                    ("zone", "Delivery zone"),
                    ("surcharge", "Delivery surcharge"),
                    ("region", "Ghana regional rate"),
                    ("country", "African delivery country"),
                    ("rule", "Special delivery rule"),
                    ("intl_settings", "International settings"),
                    ("quote_request", "Delivery quote request"),
                ],
                max_length=16,
            ),
        ),
        migrations.RunPython(seed_delivery_options, unseed_delivery_options),
    ]
