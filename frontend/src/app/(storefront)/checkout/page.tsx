"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api/client";
import {
  checkout,
  createDeliveryQuoteRequest,
  createIdempotencyKey,
  getDeliveryOptions,
  getDeliveryQuote,
  initializePayment,
} from "@/lib/api/orders";
import { formatPrice } from "@/lib/format";
import type {
  CheckoutPayload,
  DeliveryOptions,
  DeliveryQuote,
} from "@/types/api";
import { useAuth } from "@/store/auth-context";
import { useCart } from "@/store/cart-context";

const EMPTY_SHIPPING: CheckoutPayload = {
  full_name: "",
  email: "",
  phone: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "GH",
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.data && typeof error.data === "object") {
      const data = error.data as Record<string, unknown>;
      if (typeof data.detail === "string") return data.detail;
      const firstFieldError = Object.values(data).find(
        (value) => typeof value === "string" || Array.isArray(value),
      );
      if (typeof firstFieldError === "string") return firstFieldError;
      if (Array.isArray(firstFieldError)) {
        return firstFieldError.filter((value) => typeof value === "string").join(" ");
      }
    }
    return `Checkout could not be completed (error ${error.status}).`;
  }
  return error instanceof Error
    ? error.message
    : "Checkout could not be completed. Please try again.";
}

export default function CheckoutPage() {
  const { user, loading: authLoading } = useAuth();
  const { cart, loading: cartLoading, error: cartError, refresh } = useCart();
  const [shipping, setShipping] = useState(EMPTY_SHIPPING);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOptions | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quoteRequestReference, setQuoteRequestReference] = useState("");
  const [error, setError] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [orderTotal, setOrderTotal] = useState<string | null>(null);
  const [paymentNeedsSupport, setPaymentNeedsSupport] = useState(false);
  const checkoutKey = useRef<string | null>(null);
  const paymentKey = useRef<string | null>(null);
  const quoteRequestKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    getDeliveryOptions()
      .then((options) => {
        if (active) setDeliveryOptions(options);
      })
      .catch((requestError: unknown) => {
        if (active) setError(errorMessage(requestError));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user?.email) {
      setShipping((current) =>
        current.email ? current : { ...current, email: user.email },
      );
    }
  }, [user]);

  function updateShipping(field: keyof CheckoutPayload, value: string) {
    setShipping((current) => ({ ...current, [field]: value }));
    setError("");
    quoteRequestKey.current = null;
    if (field === "city" || field === "region" || field === "country") {
      setQuote(null);
      setQuoteRequestReference("");
    }
  }

  async function calculateQuote() {
    setError("");
    if (
      !shipping.city.trim() ||
      (shipping.country === "GH" && !shipping.region.trim())
    ) {
      setError("Enter your city and region before calculating delivery.");
      return;
    }
    setQuoteLoading(true);
    try {
      const result = await getDeliveryQuote({
        city: shipping.city.trim(),
        region: shipping.region.trim(),
        country: shipping.country ?? "GH",
      });
      setQuote(result);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }

  async function submitManualQuoteRequest() {
    setError("");
    if (!quote?.requires_manual_review) {
      setError("Calculate a delivery quote before requesting a manual quotation.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createDeliveryQuoteRequest({
        ...shipping,
        full_name: shipping.full_name.trim(),
        email: shipping.email.trim(),
        phone: shipping.phone.trim(),
        address_line_1: shipping.address_line_1.trim(),
        address_line_2: shipping.address_line_2?.trim() ?? "",
        city: shipping.city.trim(),
        region: shipping.region.trim(),
        postal_code: shipping.postal_code?.trim() ?? "",
        country: shipping.country ?? "GH",
        idempotency_key: (quoteRequestKey.current ??= createIdempotencyKey()),
      });
      setQuoteRequestReference(result.reference);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function startPayment() {
    setError("");
    if (!orderReference && (!quote || quote.requires_manual_review)) {
      setError("Calculate an available delivery quote before continuing.");
      return;
    }
    if (
      !orderReference &&
      (!cart?.items.length ||
        cart.items.some((item) => !item.product || !item.is_available))
    ) {
      setError("Remove unavailable products or update their quantities before checkout.");
      return;
    }

    setSubmitting(true);
    try {
      let reference = orderReference;
      if (!reference) {
        const order = await checkout(
          {
            ...shipping,
            full_name: shipping.full_name.trim(),
            email: shipping.email.trim(),
            phone: shipping.phone.trim(),
            address_line_1: shipping.address_line_1.trim(),
            address_line_2: shipping.address_line_2?.trim() ?? "",
            city: shipping.city.trim(),
            region: shipping.region.trim(),
            postal_code: shipping.postal_code?.trim() ?? "",
            country: shipping.country ?? "GH",
          },
          (checkoutKey.current ??= createIdempotencyKey()),
        );
        reference = order.public_reference;
        setOrderReference(reference);
        setOrderTotal(order.total);
        void refresh();
      }

      const payment = await initializePayment(
        reference,
        (paymentKey.current ??= createIdempotencyKey()),
      );
      if (!payment.authorization_url) {
        setPaymentNeedsSupport(true);
        throw new Error(
          "Paystack did not confirm payment setup. Contact support with your order reference before trying again.",
        );
      }
      window.location.assign(payment.authorization_url);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 502) {
        setPaymentNeedsSupport(true);
      }
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (quote?.requires_manual_review) {
      void submitManualQuoteRequest();
    } else {
      void startPayment();
    }
  }

  const canCheckout =
    !!cart?.items.length &&
    cart.items.every((item) => item.product && item.is_available);

  return (
    <section className="checkout-page">
      <p className="eyebrow">SECURE CHECKOUT</p>
      <h1>Delivery details</h1>

      {authLoading ? (
        <p className="form-note">Checking your account…</p>
      ) : !user ? (
        <div className="catalogue-message">
          <h2>Sign in to continue</h2>
          <p>Your cart is linked to your WhiteStag account.</p>
          <Link className="primary-link" href="/account">
            Sign in <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : quoteRequestReference ? (
        <div className="checkout-retry" role="status">
          <h2>Delivery quotation requested</h2>
          <p>
            Reference: <strong>{quoteRequestReference}</strong>
          </p>
          <p>
            Our team will review your delivery details and contact you with a
            quotation. No delivery fee or payment has been charged.
          </p>
        </div>
      ) : orderReference ? (
        <div className="checkout-retry">
          <h2>Your order is ready for payment</h2>
          <p>
            Order reference: <strong>{orderReference}</strong>
          </p>
          {orderTotal && <p>Total: {formatPrice(orderTotal, "GHS")}</p>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!paymentNeedsSupport && (
            <button
              className="primary-link"
              type="button"
              disabled={submitting}
              onClick={() => void startPayment()}
            >
              {submitting ? "Connecting to Paystack…" : "Continue to payment"}
            </button>
          )}
        </div>
      ) : cartLoading ? (
        <p className="form-note">Loading your cart…</p>
      ) : cartError ? (
        <div className="catalogue-message" role="alert">
          <h2>Cart unavailable</h2>
          <p>{cartError}</p>
        </div>
      ) : !cart?.items.length ? (
        <div className="catalogue-message">
          <h2>Your cart is empty</h2>
          <Link className="primary-link" href="/products">
            Browse the catalogue <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : (
        <div className="checkout-layout">
          <form className="checkout-form" onSubmit={handleSubmit}>
            {!canCheckout && (
              <p className="form-error" role="alert">
                One or more cart items are unavailable. Return to your cart to
                adjust or remove them before checkout.
              </p>
            )}
            <div className="checkout-fields">
              <label>
                <span>Full name</span>
                <input
                  autoComplete="name"
                  required
                  value={shipping.full_name}
                  onChange={(event) =>
                    updateShipping("full_name", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Email address</span>
                <input
                  autoComplete="email"
                  type="email"
                  required
                  value={shipping.email}
                  onChange={(event) =>
                    updateShipping("email", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Phone number</span>
                <input
                  autoComplete="tel"
                  type="tel"
                  required
                  value={shipping.phone}
                  onChange={(event) =>
                    updateShipping("phone", event.target.value)
                  }
                />
              </label>
              <label className="is-span-2">
                <span>Address</span>
                <input
                  autoComplete="address-line1"
                  required
                  value={shipping.address_line_1}
                  onChange={(event) =>
                    updateShipping("address_line_1", event.target.value)
                  }
                />
              </label>
              <label className="is-span-2">
                <span>Apartment, suite, etc. (optional)</span>
                <input
                  autoComplete="address-line2"
                  value={shipping.address_line_2}
                  onChange={(event) =>
                    updateShipping("address_line_2", event.target.value)
                  }
                />
              </label>
              <label>
                <span>City</span>
                <input
                  autoComplete="address-level2"
                  required
                  value={shipping.city}
                  onChange={(event) => updateShipping("city", event.target.value)}
                />
              </label>
              <label>
                <span>Region</span>
                {shipping.country === "GH" && deliveryOptions ? (
                  <select
                    autoComplete="address-level1"
                    required
                    value={shipping.region}
                    onChange={(event) =>
                      updateShipping("region", event.target.value)
                    }
                  >
                    <option value="">Select a region</option>
                    {deliveryOptions.regions.map((option) => (
                      <option
                        key={option.region_code}
                        value={option.region_name}
                        disabled={!option.is_active && !option.allow_fallback}
                      >
                        {option.region_name}
                        {!option.is_active && !option.allow_fallback
                          ? " (unavailable)"
                          : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    autoComplete="address-level1"
                    value={shipping.region}
                    onChange={(event) =>
                      updateShipping("region", event.target.value)
                    }
                  />
                )}
              </label>
              <label>
                <span>Postal code (optional)</span>
                <input
                  autoComplete="postal-code"
                  value={shipping.postal_code}
                  onChange={(event) =>
                    updateShipping("postal_code", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Country</span>
                <select
                  autoComplete="country"
                  value={shipping.country ?? "GH"}
                  onChange={(event) => updateShipping("country", event.target.value)}
                >
                  <option value="GH">Ghana</option>
                  {(deliveryOptions?.countries ?? [])
                    .filter((country) => country.country_code !== "GH")
                    .map((country) => (
                      <option
                        key={country.country_code}
                        value={country.country_code}
                      >
                        {country.country_name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button
              className="primary-link"
              type="button"
              onClick={() => void calculateQuote()}
              disabled={quoteLoading || submitting || !canCheckout}
            >
              {quoteLoading ? "Calculating delivery…" : "Calculate delivery"}
            </button>
            {quote?.status === "estimated" && (
              <div className="checkout-quote" role="status">
                <p>Delivery pricing: {quote.pricing_mode === "ghana_regional" ? "regional rate" : "distance estimate"}</p>
                {quote.base_fee && (
                  <p>Base fee: {formatPrice(quote.base_fee, quote.currency)}</p>
                )}
                {quote.distance_component && quote.distance_component !== "0" && (
                  <p>Distance charge: {formatPrice(quote.distance_component, quote.currency)}</p>
                )}
                {quote.weight_component && (
                  <p>Weight charge: {formatPrice(quote.weight_component, quote.currency)}</p>
                )}
                <p>
                  Delivery: {formatPrice(quote.delivery_fee, quote.currency)}
                </p>
                <p>
                  Estimated total: {formatPrice(quote.order_total, quote.currency)}
                </p>
                {(quote.surcharges ?? []).map((surcharge) => (
                  <p key={surcharge.code}>
                    {surcharge.name}: {formatPrice(surcharge.amount, quote.currency)}
                  </p>
                ))}
              </div>
            )}
            {quote?.requires_manual_review && (
              <div className="checkout-quote" role="status">
                <p>{quote.review_reason}</p>
                {quote.pricing_mode === "international_manual" && (
                  <p>{deliveryOptions?.international.instructions}</p>
                )}
                <p>No automatic shipping fee is applied to this request.</p>
                {(quote.pricing_mode !== "international_manual" ||
                  quote.quote_request_available) && (
                  <button
                    className="primary-link"
                    type="submit"
                    disabled={submitting || !canCheckout}
                  >
                    {submitting ? "Submitting request…" : "Request delivery quotation"}
                  </button>
                )}
              </div>
            )}
            <button
              className="primary-link"
              type="submit"
              disabled={
                submitting ||
                !canCheckout ||
                !quote ||
                quote.requires_manual_review
              }
            >
              {submitting ? "Connecting to Paystack…" : "Pay securely with Paystack"}
            </button>
          </form>

          <aside className="checkout-summary">
            <h2>Your order</h2>
            {cart.items.map((item) => (
              <div className="checkout-summary-item" key={item.id}>
                {item.product?.image_url ? (
                  <span className="checkout-summary-image">
                    <Image
                      src={item.product.image_url}
                      alt=""
                      fill
                      sizes="56px"
                      unoptimized
                    />
                  </span>
                ) : null}
                <span>
                  {item.product?.name ?? "Unavailable item"} × {item.quantity}
                </span>
                <strong>
                  {item.product?.price
                    ? formatPrice(
                        (
                          Number(item.product.price) * item.quantity
                        ).toFixed(2),
                        item.product.currency,
                      )
                    : "—"}
                </strong>
              </div>
            ))}
            <p className="checkout-summary-note">
              Stock, prices, and delivery are confirmed by the server before payment.
            </p>
          </aside>
        </div>
      )}
    </section>
  );
}
