import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("enquiries", "0001_initial"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="vehicleenquiry",
            options={
                "ordering": ["-created_at"],
                "verbose_name_plural": "Product Enquiries",
            },
        ),
        migrations.AlterField(
            model_name="vehicleenquiry",
            name="product",
            field=models.ForeignKey(
                help_text="The product being enquired about.",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="enquiries",
                to="catalogue.product",
            ),
        ),
    ]
