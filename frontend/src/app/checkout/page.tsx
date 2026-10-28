"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, idempotencyKey } from "@/lib/api/client";
import {
  getDeliveryQuote,
  getDeliveryZones,
  initializeCheckout,
  initializePayment,
} from "@/lib/api/orders";
import {
  getOrCreatePaymentIdempotencyKey,
  savePaymentReference,
  redirectToPaystack,
} from "@/lib/payments";
import type {
  CheckoutDetails,
  DeliveryQuote,
  DeliveryZone,
  Order,
} from "@/types/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/store/auth-context";
import { useCart } from "@/store/cart-context";

const ORDER_IDEMPOTENCY_KEY = "whitestag.checkout.order-idempotency";

function paymentReferenceFromError(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.detail || typeof error.detail !== "object") {
    return null;
  }
  const detail = error.detail as Record<string, unknown>;
  return typeof detail.reference === "string" ? detail.reference : null;
}

function money(value: string | number, currency: string): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
  }).format(Number(value));
}

export default function CheckoutPage() {
  const router = useRouter();
  const { customer, isLoading: authLoading } = useAuth();
  const { cart, isLoading: cartLoading, refresh: refreshCart } = useCart();
  const [details, setDetails] = useState<CheckoutDetails>({
    full_name: "",
    email: customer?.email ?? "",
    phone: "",
    address_line_1: "",
    address_line_2: "",
    city: "",
    region: "",
    postal_code: "",
    country: "GH",
  });
  const [order, setOrder] = useState<Order | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [deliveryZonesLoading, setDeliveryZonesLoading] = useState(true);
  const [deliveryZonesError, setDeliveryZonesError] = useState("");
  const [deliveryZonesRetry, setDeliveryZonesRetry] = useState(0);
  const [deliveryZoneCode, setDeliveryZoneCode] = useState("");
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [isQuotingDelivery, setIsQuotingDelivery] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState("");

  const selectedDeliveryZone = deliveryZones.find(
    (zone) => zone.code === deliveryZoneCode,
  );

  useEffect(() => {
    if (customer?.email && !details.email) {
      setDetails((current) => ({ ...current, email: customer.email }));
    }
  }, [customer, details.email]);

  useEffect(() => {
    setDeliveryQuote(null);
  }, [cart?.updated_at]);

  useEffect(() => {
    let active = true;
    setDeliveryZonesLoading(true);
    setDeliveryZonesError("");
    getDeliveryZones()
      .then(({ results }) => {
        if (active) setDeliveryZones(results);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setDeliveryZonesError(
          requestError instanceof Error
            ? requestError.message
            : "Delivery areas could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setDeliveryZonesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [deliveryZonesRetry]);

  function updateField<K extends keyof CheckoutDetails>(
    field: K,
    value: CheckoutDetails[K],
  ) {
    window.sessionStorage.removeItem(ORDER_IDEMPOTENCY_KEY);
    setDetails((current) => ({ ...current, [field]: value }));
    if (field === "city" || field === "region" || field === "country") {
      setDeliveryQuote(null);
    }
  }

  function updateDeliveryZone(code: string) {
    const zone = deliveryZones.find((item) => item.code === code);
    setDeliveryZoneCode(code);
    setDeliveryQuote(null);
    setDeliveryQuoteError("");
    window.sessionStorage.removeItem(ORDER_IDEMPOTENCY_KEY);
    setDetails((current) => ({
      ...current,
      city: zone?.city ?? "",
      region: zone?.region ?? "",
      country: "GH",
    }));
  }

  async function requestDeliveryQuote() {
    if (!selectedDeliveryZone) {
      setDeliveryQuoteError("Choose a delivery area before requesting a quote.");
      return;
    }
    setIsQuotingDelivery(true);
    setDeliveryQuoteError("");
    setDeliveryQuote(null);
    try {
      const quote = await getDeliveryQuote({
        city: details.city,
        region: details.region,
        country: "GH",
      });
      setDeliveryQuote(quote);
    } catch (requestError) {
      setDeliveryQuoteError(
        requestError instanceof ApiError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : "A delivery quote could not be calculated.",
      );
    } finally {
      setIsQuotingDelivery(false);
    }
  }

  async function beginPayment(currentOrder: Order) {
    setIsSubmitting(true);
    setError("");
    try {
      const payment = await initializePayment(
        currentOrder.public_reference,
        getOrCreatePaymentIdempotencyKey(currentOrder.public_reference),
      );
      savePaymentReference(currentOrder.public_reference, payment.reference);
      setPaymentReference(payment.reference);
      if (!payment.authorization_url) {
        setError(
          "Your payment attempt is still being confirmed. Do not start another charge; verify its status from the payment page.",
        );
        return;
      }
      redirectToPaystack(payment.authorization_url);
    } catch (requestError) {
      const paymentReference = paymentReferenceFromError(requestError);
      if (paymentReference) {
        savePaymentReference(currentOrder.public_reference, paymentReference);
        setPaymentReference(paymentReference);
      }
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : "Payment could not be started. You can safely check its status before trying again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) {
      router.push(`/account?next=${encodeURIComponent("/checkout")}`);
      return;
    }
    if (!cart?.items.length) {
      setError("Your cart is empty. Add available spare parts before checkout.");
      return;
    }
    if (cart.items.some((item) => !item.product || !item.is_available)) {
      setError("One or more cart items are unavailable. Update your cart before checkout.");
      return;
    }
    if (!deliveryQuote || deliveryQuote.status !== "estimated") {
      setError("Calculate an available delivery quote before creating your order.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const key =
        window.sessionStorage.getItem(ORDER_IDEMPOTENCY_KEY) ?? idempotencyKey();
      window.sessionStorage.setItem(ORDER_IDEMPOTENCY_KEY, key);
      const createdOrder = order ?? await initializeCheckout(details, key);
      setOrder(createdOrder);
      window.localStorage.setItem(
        "whitestag.checkout.last-order",
        createdOrder.public_reference,
      );
      await refreshCart();
      if (createdOrder.delivery_fee !== deliveryQuote.delivery_fee) {
        setError(
          "The delivery price changed before the order was created. Review the server-confirmed total, then choose Continue to payment.",
        );
        return;
      }
      await beginPayment(createdOrder);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "We could not create your order. Please review your details and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authLoading || cartLoading) {
    return <div className="page-container section-space"><Skeleton className="checkout-skeleton" /></div>;
  }
  if (!customer) {
    return (
      <div className="page-container section-space">
        <EmptyState
          title="Sign in to continue to checkout"
          description="Your order and delivery details are securely linked to your WhiteStag account."
          action={<Button href="/account?next=%2Fcheckout">Sign in or create an account</Button>}
        />
      </div>
    );
  }
  if (!order && (!cart || cart.items.length === 0)) {
    return (
      <div className="page-container section-space">
        <EmptyState
          title="Your cart is empty"
          description="Add available spare parts to your cart before starting checkout."
          action={<Button href="/products">Browse spare parts</Button>}
        />
      </div>
    );
  }

  const estimate = cart?.items.reduce((sum, item) => {
    if (!item.product?.price) return sum;
    return sum + Number(item.product.price) * item.quantity;
  }, 0) ?? 0;
  const currency = order?.currency ?? cart?.items.find((item) => item.product)?.product?.currency ?? "GHS";

  return (
    <div className="page-container section-space">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/cart">Cart</Link><span>/</span><span>Checkout</span>
      </nav>
      <div className="page-heading">
        <div><p className="eyebrow">Secure checkout</p><h1>{order ? "Order created" : "Delivery details"}</h1></div>
        <span className="checkout-secure">Payments are completed securely with Paystack</span>
      </div>

      <div className="checkout-layout">
        {order ? (
          <section className="checkout-form-card">
            <p className="eyebrow">Order reference</p>
            <h2>{order.public_reference}</h2>
            <p>Your order has been created. The server calculated the total and reserved eligible stock. Continue to Paystack to complete payment.</p>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {paymentReference ? (
              <p className="checkout-verify-link">
                <Link className="text-link" href={`/checkout/verify?reference=${encodeURIComponent(paymentReference)}`}>
                  Verify this payment status
                </Link>
              </p>
            ) : null}
            <div className="checkout-actions">
              <Button type="button" onClick={() => void beginPayment(order)} disabled={isSubmitting}>
                {isSubmitting ? "Connecting to Paystack…" : "Continue to payment"}
              </Button>
              <Button href={`/account/orders/${encodeURIComponent(order.public_reference)}`} variant="outline">View order</Button>
            </div>
            <p className="checkout-note">
              If the provider page does not return you automatically, open your order and use its verification action. A pending or inconclusive result is not a successful payment.
            </p>
          </section>
        ) : (
          <form className="checkout-form-card form-stack" onSubmit={submitCheckout}>
            <div className="checkout-form-heading">
              <p className="eyebrow">Delivery information</p>
              <h2>Where should we deliver?</h2>
              <p>These details are attached to this order. Your account email is pre-filled.</p>
            </div>
            <div className="form-grid">
              <Input label="Full name" name="full_name" autoComplete="name" value={details.full_name} onChange={(event) => updateField("full_name", event.target.value)} required maxLength={200} />
              <Input label="Email address" name="email" type="email" autoComplete="email" value={details.email} onChange={(event) => updateField("email", event.target.value)} required maxLength={254} />
              <Input label="Phone number" name="phone" type="tel" autoComplete="tel" value={details.phone} onChange={(event) => updateField("phone", event.target.value)} required maxLength={32} />
              <Input label="Address line 1" name="address_line_1" autoComplete="address-line1" value={details.address_line_1} onChange={(event) => updateField("address_line_1", event.target.value)} required maxLength={255} />
              <Input label="Address line 2 (optional)" name="address_line_2" autoComplete="address-line2" value={details.address_line_2 ?? ""} onChange={(event) => updateField("address_line_2", event.target.value)} maxLength={255} />
              <div className="field">
                <label className="field-label" htmlFor="delivery-zone">Delivery area</label>
                <select
                  id="delivery-zone"
                  className="select"
                  value={deliveryZoneCode}
                  onChange={(event) => updateDeliveryZone(event.target.value)}
                  disabled={deliveryZonesLoading || deliveryZonesError !== ""}
                  required
                >
                  <option value="">
                    {deliveryZonesLoading ? "Loading delivery areas…" : "Choose a delivery area"}
                  </option>
                  {deliveryZones.map((zone) => (
                    <option key={zone.code} value={zone.code}>
                      {zone.name} — {zone.city}, {zone.region}
                    </option>
                  ))}
                </select>
                {deliveryZonesLoading ? (
                  <p className="checkout-note" role="status">Loading available delivery areas…</p>
                ) : null}
                {deliveryZonesError ? (
                  <div className="field-error" role="alert">
                    <p>{deliveryZonesError}</p>
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => setDeliveryZonesRetry((attempt) => attempt + 1)}
                    >
                      Try loading delivery areas again
                    </button>
                  </div>
                ) : null}
                {!deliveryZonesLoading && !deliveryZonesError && deliveryZones.length === 0 ? (
                  <p className="field-error" role="status">
                    No delivery areas are currently available. Please contact WhiteStag.
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void requestDeliveryQuote()}
                  disabled={!selectedDeliveryZone || isQuotingDelivery || deliveryZonesLoading}
                >
                  {isQuotingDelivery ? "Calculating delivery…" : "Calculate delivery quote"}
                </Button>
                {deliveryQuoteError ? (
                  <p className="form-error" role="alert">{deliveryQuoteError}</p>
                ) : null}
                {deliveryQuote?.status === "manual_review" ? (
                  <p className="form-error" role="status">
                    {deliveryQuote.review_reason} No delivery price has been quoted; contact WhiteStag for assistance.
                  </p>
                ) : null}
                {deliveryQuote?.status === "estimated" ? (
                  <p className="checkout-note" role="status">
                    Estimated delivery: {money(deliveryQuote.delivery_fee ?? "0", deliveryQuote.currency)} · {deliveryQuote.estimated_distance_km} km route estimate · {deliveryQuote.shipment_weight_kg} kg shipment.
                  </p>
                ) : null}
              </div>
              <div className="field">
                <span className="field-label">Country</span>
                <p>Ghana</p>
              </div>
              <Input label="Postal code (optional)" name="postal_code" autoComplete="postal-code" value={details.postal_code ?? ""} onChange={(event) => updateField("postal_code", event.target.value)} maxLength={24} />
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <Button type="submit" disabled={isSubmitting || isQuotingDelivery || deliveryZonesLoading || Boolean(deliveryZonesError) || !selectedDeliveryZone || deliveryQuote?.status !== "estimated" || !cart?.items.length || cart.items.some((item) => !item.product || !item.is_available)}>
              {isSubmitting ? "Creating order…" : "Create order and pay"}
            </Button>
            <p className="checkout-note">Delivery and product prices are estimated by the backend from configured rates and trusted product weights. Checkout validates them again before creating the order.</p>
          </form>
        )}

        <aside className="checkout-summary">
          <h2>Order summary</h2>
          {order ? (
            <>
              {order.items.map((item) => (
                <div className="checkout-summary-item" key={`${item.product_sku}-${item.product_name}`}>
                  <span>{item.product_name}<small>Qty {item.quantity}</small></span>
                  <strong>{money(item.line_total, order.currency)}</strong>
                </div>
              ))}
              <div className="summary-row"><span>Subtotal</span><span>{money(order.subtotal, order.currency)}</span></div>
              <div className="summary-row"><span>Estimated delivery</span><span>{money(order.delivery_fee, order.currency)}</span></div>
              {order.delivery_pricing_snapshot.status === "estimated" ? (
                <>
                  <div className="summary-row"><span>Distance estimate</span><span>{order.estimated_distance_km} km</span></div>
                  <div className="summary-row"><span>Shipment weight</span><span>{order.shipment_weight_kg} kg</span></div>
                  <div className="summary-row"><span>Base fee</span><span>{money(order.delivery_pricing_snapshot.base_fee ?? "0", order.currency)}</span></div>
                  <div className="summary-row"><span>Distance component</span><span>{money(order.delivery_pricing_snapshot.distance_component ?? "0", order.currency)}</span></div>
                  <div className="summary-row"><span>Weight component</span><span>{money(order.delivery_pricing_snapshot.weight_component ?? "0", order.currency)}</span></div>
                  {order.delivery_pricing_snapshot.surcharges.map((surcharge) => (
                    <div className="summary-row" key={surcharge.code}>
                      <span>{surcharge.name}</span><span>{money(surcharge.amount, order.currency)}</span>
                    </div>
                  ))}
                </>
              ) : null}
              <div className="summary-row"><span>Discount</span><span>−{money(order.discount, order.currency)}</span></div>
              <div className="summary-row summary-total"><strong>Total</strong><strong>{money(order.total, order.currency)}</strong></div>
            </>
          ) : (
            <>
              {(cart?.items ?? []).map((item) => (
                <div className="checkout-summary-item" key={item.id}>
                  <span>{item.product?.name ?? "Unavailable item"}<small>Qty {item.quantity}</small></span>
                  <strong>{item.product?.price ? money(Number(item.product.price) * item.quantity, currency) : "—"}</strong>
                </div>
              ))}
              <div className="summary-row"><span>Estimated subtotal</span><span>{money(estimate, currency)}</span></div>
              {deliveryQuote?.status === "estimated" ? (
                <>
                  <div className="summary-row"><span>Base fee</span><span>{money(deliveryQuote.base_fee ?? "0", deliveryQuote.currency)}</span></div>
                  <div className="summary-row"><span>Distance component</span><span>{money(deliveryQuote.distance_component ?? "0", deliveryQuote.currency)}</span></div>
                  <div className="summary-row"><span>Weight component</span><span>{money(deliveryQuote.weight_component ?? "0", deliveryQuote.currency)}</span></div>
                  {deliveryQuote.surcharges.map((surcharge) => (
                    <div className="summary-row" key={surcharge.code}>
                      <span>{surcharge.name}</span><span>{money(surcharge.amount, deliveryQuote.currency)}</span>
                    </div>
                  ))}
                  <div className="summary-row summary-total">
                    <strong>Estimated order total</strong>
                    <strong>{money(deliveryQuote.order_total ?? String(estimate), deliveryQuote.currency)}</strong>
                  </div>
                  <p className="checkout-note">
                    Estimate based on {deliveryQuote.formula_version}; final pricing is saved with the order before payment.
                  </p>
                </>
              ) : (
                <div className="summary-row">
                  <span>Delivery estimate</span>
                  <span>{deliveryQuote?.status === "manual_review" ? "Manual review" : "Calculate quote"}</span>
                </div>
              )}
              <p className="checkout-note">This is an estimate only. The backend calculates the final order amount.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
