from decimal import Decimal, ROUND_DOWN, ROUND_HALF_EVEN, ROUND_HALF_UP, ROUND_UP

from django.db.models import Q

from apps.catalogue.models import Product

from .models import (
    DeliveryPricingConfiguration,
    DeliverySurcharge,
    DeliveryZone,
)


MAX_SHIPMENT_WEIGHT_KG = Decimal("10000.000")
MAX_DISTANCE_KM = Decimal("20000.000")
MAX_DELIVERY_FEE = Decimal("1000000.00")
MONEY_QUANTUM = Decimal("0.01")

ROUNDING_MODES = {
    DeliveryPricingConfiguration.RoundingMode.HALF_UP: ROUND_HALF_UP,
    DeliveryPricingConfiguration.RoundingMode.HALF_EVEN: ROUND_HALF_EVEN,
    DeliveryPricingConfiguration.RoundingMode.UP: ROUND_UP,
    DeliveryPricingConfiguration.RoundingMode.DOWN: ROUND_DOWN,
}


class DistanceProviderError(Exception):
    """A configured distance provider could not produce a trusted estimate."""


class DistanceProviderTimeout(DistanceProviderError):
    pass


class ZoneEstimateDistanceProvider:
    """Uses the delivery zone's staff-configured distance estimate."""

    def estimate_distance(self, zone, destination):
        if zone.estimated_distance_km is None:
            return None
        return zone.estimated_distance_km, "zone_estimate"


def _decimal_text(value):
    return format(value, "f") if value is not None else None


def _manual_review(
    reason,
    *,
    zone=None,
    destination=None,
    weight=None,
    distance=None,
    source="",
):
    destination = destination or {}
    return {
        "status": "manual_review",
        "requires_manual_review": True,
        "review_reason": reason,
        "currency": "GHS",
        "base_fee": None,
        "distance_component": None,
        "weight_component": None,
        "surcharges": [],
        "estimated_distance_km": _decimal_text(distance),
        "shipment_weight_kg": _decimal_text(weight),
        "distance_source": source,
        "delivery_fee": None,
        "minimum_fee_applied": False,
        "maximum_fee_applied": False,
        "formula_version": None,
        "pricing_inputs": {},
        "weighted_items": [],
        "subtotal": None,
        "destination": {
            "city": zone.city if zone else destination.get("city", ""),
            "region": zone.region if zone else destination.get("region", ""),
            "country": destination.get("country", "GH"),
            "zone_code": zone.code if zone else "",
        },
        "order_total": None,
    }


def _calculate_weight(lines):
    total_weight = Decimal("0")
    for product, quantity in lines:
        product_weight = product.weight_kg
        if (
            not isinstance(product_weight, Decimal)
            or not product_weight.is_finite()
            or product_weight <= 0
        ):
            return None
        total_weight += product_weight * quantity
    return total_weight


def _valid_product_weight(product):
    weight = product.weight_kg
    return (
        isinstance(weight, Decimal)
        and weight.is_finite()
        and weight > 0
    )


def _configuration_inputs(configuration):
    return {
        "base_fee": _decimal_text(configuration.base_fee),
        "rate_per_km": _decimal_text(configuration.rate_per_km),
        "rate_per_kg": _decimal_text(configuration.rate_per_kg),
        "minimum_fee": _decimal_text(configuration.minimum_fee),
        "maximum_fee": _decimal_text(configuration.maximum_fee),
        "rounding_mode": configuration.rounding_mode,
    }


def _weighted_items(lines):
    return [
        {
            "product_id": product.pk,
            "sku": product.sku,
            "quantity": quantity,
            "unit_weight_kg": (
                _decimal_text(product.weight_kg)
                if _valid_product_weight(product)
                else None
            ),
            "line_weight_kg": (
                _decimal_text(product.weight_kg * quantity)
                if _valid_product_weight(product)
                else None
            ),
        }
        for product, quantity in lines
    ]


def _apply_configuration(quote, configuration):
    quote["currency"] = configuration.currency
    quote["formula_version"] = configuration.version
    quote["pricing_inputs"] = _configuration_inputs(configuration)
    return quote


def calculate_delivery_pricing(
    destination,
    lines,
    *,
    lock_rows=False,
    distance_provider=None,
):
    """Return a trusted quote or a manual-review result; client amounts are unused."""
    zones = DeliveryZone.objects
    configurations = DeliveryPricingConfiguration.objects
    surcharges = DeliverySurcharge.objects
    if lock_rows:
        zones = zones.select_for_update()
        configurations = configurations.select_for_update()
        surcharges = surcharges.select_for_update()

    country = destination.get("country", "GH")
    city = destination.get("city", "").strip()
    region = destination.get("region", "").strip()
    if country != "GH" or not city or not region:
        return _manual_review(
            "Unsupported or incomplete delivery destination.",
            destination=destination,
        )

    zone = zones.filter(
        is_active=True,
        city__iexact=city,
        region__iexact=region,
    ).first()
    if zone is None:
        return _manual_review(
            "This destination has no configured active delivery zone.",
            destination=destination,
        )

    configuration = configurations.filter(is_active=True).first()
    if configuration is None:
        return _manual_review("Delivery pricing is not configured.")

    invalid_lines = [
        product
        for product, _ in lines
        if (
            product.publication_status != Product.PublicationStatus.PUBLISHED
            or product.product_type != Product.ProductType.SPARE_PART
            or product.sales_method != Product.SalesMethod.DIRECT_PURCHASE
            or product.price is None
            or product.price <= 0
            or product.currency != configuration.currency
        )
    ]
    if invalid_lines:
        quote = _manual_review(
            "One or more cart products are no longer eligible for checkout.",
            zone=zone,
            destination=destination,
        )
        quote["weighted_items"] = _weighted_items(lines)
        return _apply_configuration(quote, configuration)

    weight = _calculate_weight(lines)
    provider = distance_provider or ZoneEstimateDistanceProvider()
    try:
        distance_result = provider.estimate_distance(zone, destination)
    except (DistanceProviderError, TimeoutError, ConnectionError):
        distance_result = None
    if (
        distance_result is None
        or not isinstance(distance_result, tuple)
        or len(distance_result) != 2
    ):
        quote = _manual_review(
            "A trusted route distance is unavailable; staff review is required.",
            zone=zone,
            weight=weight,
            destination=destination,
        )
        quote["weighted_items"] = _weighted_items(lines)
        return _apply_configuration(quote, configuration)

    distance, distance_source = distance_result
    if (
        not isinstance(distance, Decimal)
        or not distance.is_finite()
        or distance <= 0
    ):
        quote = _manual_review(
            "The route provider returned an invalid distance; staff review is required.",
            zone=zone,
            weight=weight,
            destination=destination,
        )
        quote["weighted_items"] = _weighted_items(lines)
        return _apply_configuration(quote, configuration)

    if weight is None:
        quote = _manual_review(
            "One or more products have no valid shipping weight; staff review is required.",
            zone=zone,
            distance=distance,
            source=distance_source,
            destination=destination,
        )
        quote["weighted_items"] = _weighted_items(lines)
        return _apply_configuration(quote, configuration)

    if (
        not isinstance(distance_source, str)
        or not distance_source
        or len(distance_source) > 40
    ):
        quote = _manual_review(
            "The route provider returned an invalid distance source; staff review is required.",
            zone=zone,
            weight=weight,
            distance=distance,
            destination=destination,
        )
        quote["weighted_items"] = _weighted_items(lines)
        return _apply_configuration(quote, configuration)

    if weight > MAX_SHIPMENT_WEIGHT_KG:
        quote = _manual_review(
            "Shipment weight exceeds the automatic-pricing safety limit.",
            zone=zone,
            weight=weight,
            distance=distance,
            source=distance_source,
            destination=destination,
        )
        quote["weighted_items"] = _weighted_items(lines)
        return _apply_configuration(quote, configuration)
    if distance > MAX_DISTANCE_KM:
        quote = _manual_review(
            "Route distance exceeds the automatic-pricing safety limit.",
            zone=zone,
            weight=weight,
            distance=distance,
            source=distance_source,
            destination=destination,
        )
        quote["weighted_items"] = _weighted_items(lines)
        return _apply_configuration(quote, configuration)

    surcharge_rows = list(
        surcharges.filter(is_active=True)
        .filter(Q(zone__isnull=True) | Q(zone=zone))
        .order_by("pk")
    )

    distance_component = distance * configuration.rate_per_km
    weight_component = weight * configuration.rate_per_kg
    surcharge_breakdown = [
        {
            "code": surcharge.code,
            "name": surcharge.name,
            "amount": _decimal_text(surcharge.amount),
        }
        for surcharge in surcharge_rows
    ]
    surcharge_total = sum(
        (surcharge.amount for surcharge in surcharge_rows),
        Decimal("0"),
    )
    unbounded_total = (
        configuration.base_fee
        + distance_component
        + weight_component
        + surcharge_total
    )
    fee_before_rounding = max(unbounded_total, configuration.minimum_fee)
    minimum_applied = unbounded_total < configuration.minimum_fee
    maximum_applied = False
    if (
        configuration.maximum_fee is not None
        and fee_before_rounding > configuration.maximum_fee
    ):
        fee_before_rounding = configuration.maximum_fee
        maximum_applied = True
    fee = fee_before_rounding.quantize(
        MONEY_QUANTUM,
        rounding=ROUNDING_MODES[configuration.rounding_mode],
    )

    review_reason = ""
    if (
        configuration.review_weight_threshold_kg is not None
        and weight > configuration.review_weight_threshold_kg
    ):
        review_reason = "Shipment weight exceeds the configured review threshold."
    elif (
        configuration.review_distance_threshold_km is not None
        and distance > configuration.review_distance_threshold_km
    ):
        review_reason = "Route distance exceeds the configured review threshold."
    elif (
        configuration.review_fee_threshold is not None
        and fee > configuration.review_fee_threshold
    ):
        review_reason = "Delivery fee exceeds the configured review threshold."
    elif fee > MAX_DELIVERY_FEE:
        review_reason = "Delivery fee exceeds the automatic-pricing safety limit."

    if review_reason:
        quote = _manual_review(
            review_reason,
            zone=zone,
            weight=weight,
            distance=distance,
            source=distance_source,
            destination=destination,
        )
        quote["weighted_items"] = _weighted_items(lines)
        return _apply_configuration(quote, configuration)

    subtotal = sum(
        (product.price * quantity for product, quantity in lines),
        Decimal("0"),
    )
    return {
        "status": "estimated",
        "requires_manual_review": False,
        "review_reason": "",
        "currency": configuration.currency,
        "base_fee": _decimal_text(configuration.base_fee),
        "distance_component": _decimal_text(distance_component),
        "weight_component": _decimal_text(weight_component),
        "surcharges": surcharge_breakdown,
        "estimated_distance_km": _decimal_text(distance),
        "shipment_weight_kg": _decimal_text(weight),
        "distance_source": distance_source,
        "delivery_fee": _decimal_text(fee),
        "minimum_fee_applied": minimum_applied,
        "maximum_fee_applied": maximum_applied,
        "formula_version": configuration.version,
        "pricing_inputs": _configuration_inputs(configuration),
        "weighted_items": _weighted_items(lines),
        "subtotal": _decimal_text(subtotal),
        "destination": {
            "city": zone.city,
            "region": zone.region,
            "country": country,
            "zone_code": zone.code,
        },
        "order_total": _decimal_text(subtotal + fee),
    }


def snapshot_delivery_pricing(quote):
    """Freeze the rate inputs and complete displayed breakdown in an order."""
    return dict(quote)
