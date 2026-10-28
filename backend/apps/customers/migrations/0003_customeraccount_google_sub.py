from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0002_wishlistitem"),
    ]

    operations = [
        migrations.AddField(
            model_name="customeraccount",
            name="google_sub",
            field=models.CharField(
                blank=True,
                max_length=255,
                null=True,
                unique=True,
            ),
        ),
    ]
