from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.orders.services import expire_unpaid_orders


class Command(BaseCommand):
    help = "Release reservations and expire eligible old unpaid orders."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        hours = settings.ORDER_EXPIRY_HOURS
        if hours <= 0:
            raise CommandError("ORDER_EXPIRY_HOURS must be positive.")
        if options["limit"] <= 0:
            raise CommandError("--limit must be positive.")

        cutoff = timezone.now() - timedelta(hours=hours)
        expired_ids = expire_unpaid_orders(cutoff, limit=options["limit"])
        self.stdout.write(
            self.style.SUCCESS(f"Expired {len(expired_ids)} unpaid order(s).")
        )
