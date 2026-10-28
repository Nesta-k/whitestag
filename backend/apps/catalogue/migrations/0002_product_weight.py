import decimal

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("catalogue", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="weight_kg",
            field=models.DecimalField(
                blank=True,
                decimal_places=3,
                help_text=(
                    "Product shipping weight in kilograms. Leave blank if unknown."
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
            model_name="product",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("weight_kg__isnull", True),
                    ("weight_kg__gt", 0),
                    _connector="OR",
                ),
                name="product_weight_positive_or_unknown",
            ),
        ),
    ]
