from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0003_payment_authorization_url"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="payment",
            name="uniq_order_unresolved_payment",
        ),
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    status__in=["initializing", "pending"],
                ),
                fields=("order",),
                name="uniq_order_active_payment",
            ),
        ),
    ]
