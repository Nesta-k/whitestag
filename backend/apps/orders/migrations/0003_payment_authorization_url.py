from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0002_payment_paymentevent"),
    ]

    operations = [
        migrations.AddField(
            model_name="payment",
            name="authorization_url",
            field=models.URLField(blank=True, max_length=2048),
        ),
    ]
