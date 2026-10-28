"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getOrder, initializePayment } from "@/lib/api/orders";
import { ApiError } from "@/lib/api/client";
import {
  getOrCreatePaymentIdempotencyKey,
  getPaymentReference,
  redirectToPaystack,
  savePaymentReference,
} from "@/lib/payments";
import { useAuth } from "@/store/auth-context";
import type { Order } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

function paymentReferenceFromError(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.detail || typeof error.detail !== "object") {
    return null;
  }
  const detail = error.detail as Record<string, unknown>;
  return typeof detail.reference === "string" ? detail.reference : null;
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function OrderDetailPage() {
  const { reference } = useParams<{ reference: string }>();
  const { customer, isLoading: authLoading } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [isStartingPayment, setIsStartingPayment] = useState(false);

  useEffect(() => {
    if (authLoading || !customer) {
      setLoading(authLoading);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    setPaymentReference(getPaymentReference(reference) ?? "");
    getOrder(reference)
      .then((result) => { if (active) setOrder(result); })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof ApiError ? requestError.message : "Could not load this order.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, customer, reference]);

  const startPayment = useCallback(async () => {
    if (!order) return;
    setIsStartingPayment(true);
    setPaymentError("");
    try {
      const payment = await initializePayment(
        order.public_reference,
        getOrCreatePaymentIdempotencyKey(
          order.public_reference,
          order.payment_status === "failed",
        ),
      );
      savePaymentReference(order.public_reference, payment.reference);
      setPaymentReference(payment.reference);
      if (payment.authorization_url) {
        redirectToPaystack(payment.authorization_url);
      } else {
        setPaymentError("The payment attempt is still being confirmed. Check its status before trying another charge.");
      }
    } catch (requestError) {
      const failedReference = paymentReferenceFromError(requestError);
      if (failedReference) {
        savePaymentReference(order.public_reference, failedReference);
        setPaymentReference(failedReference);
      }
      setPaymentError(
        requestError instanceof ApiError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : "Payment could not be started.",
      );
    } finally {
      setIsStartingPayment(false);
    }
  }, [order]);

  if (authLoading || loading) return <div className="page-container section-space"><Skeleton className="orders-skeleton" /></div>;
  if (!customer) return <div className="page-container section-space"><EmptyState title="Sign in to view this order" description="Order details are private to the account that placed the order." action={<Button href={`/account?next=${encodeURIComponent(`/account/orders/${reference}`)}`}>Sign in</Button>} /></div>;
  if (error) return <div className="page-container section-space"><ErrorState message={error} /></div>;
  if (!order) return null;

  const formatMoney = (value: string) => new Intl.NumberFormat("en-GH", { style: "currency", currency: order.currency }).format(Number(value));
  const canStartPayment =
    order.status === "pending" &&
    (order.payment_status === "unpaid" || order.payment_status === "failed");
  const needsVerification = order.payment_status === "pending" && paymentReference.length > 0;
  const paymentAttemptUnknown = order.payment_status === "pending" && !paymentReference;

  return (
    <div className="page-container section-space">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/account/orders">Orders</Link><span>/</span><span>{order.public_reference}</span></nav>
      <div className="page-heading order-detail-heading">
        <div>
          <p className="eyebrow">Order details</p>
          <h1>Order {order.public_reference}</h1>
          <p>Placed <time dateTime={order.created_at}>{dateTime(order.created_at)}</time></p>
          <p>Last updated <time dateTime={order.updated_at}>{dateTime(order.updated_at)}</time></p>
        </div>
        <div className="order-badges">
          <Badge>{order.status.replaceAll("_", " ")}</Badge>
          <Badge>{order.payment_status.replaceAll("_", " ")}</Badge>
        </div>
      </div>

      {canStartPayment || needsVerification ? (
        <section className="order-payment-action">
          <div>
            <p className="eyebrow">Payment</p>
            <h2>{needsVerification ? "Check your payment status" : "Complete your payment"}</h2>
            <p>
              {needsVerification
                ? "WhiteStag will verify this persisted payment attempt with the backend."
                : "Payment is handled securely through Paystack. Your order is not marked paid until the backend confirms it."}
            </p>
          </div>
          {needsVerification ? (
            <Button href={`/checkout/verify?reference=${encodeURIComponent(paymentReference)}`}>Verify payment</Button>
          ) : (
            <Button type="button" onClick={() => void startPayment()} disabled={isStartingPayment}>
              {isStartingPayment ? "Connecting…" : order.payment_status === "failed" ? "Try payment again" : "Pay for this order"}
            </Button>
          )}
          {paymentError ? <p className="form-error" role="alert">{paymentError}</p> : null}
        </section>
      ) : null}
      {paymentAttemptUnknown ? (
        <section className="payment-review" role="status">
          <strong>Payment attempt pending</strong>
          <p>This browser does not have the payment reference. For safety, WhiteStag will not start another charge. Return to the browser where payment began or contact WhiteStag support.</p>
        </section>
      ) : null}

      <div className="order-detail-layout">
        <section className="order-items">
          <h2>Items</h2>
          {order.items.map((item) => (
            <div className="order-item" key={`${item.product_sku}-${item.product_name}`}>
              <div><strong>{item.product_name}</strong><small>SKU {item.product_sku} · Quantity {item.quantity} · {formatMoney(item.unit_price)} each</small></div>
              <strong>{formatMoney(item.line_total)}</strong>
            </div>
          ))}
          <div className="summary-row"><span>Subtotal</span><span>{formatMoney(order.subtotal)}</span></div>
          <div className="summary-row"><span>Estimated delivery</span><span>{formatMoney(order.delivery_fee)}</span></div>
          {order.delivery_pricing_snapshot.status === "estimated" ? (
            <>
              <div className="summary-row"><span>Route distance estimate</span><span>{order.estimated_distance_km} km</span></div>
              <div className="summary-row"><span>Shipment weight</span><span>{order.shipment_weight_kg} kg</span></div>
              <div className="summary-row"><span>Base fee</span><span>{formatMoney(order.delivery_pricing_snapshot.base_fee ?? "0")}</span></div>
              <div className="summary-row"><span>Distance component</span><span>{formatMoney(order.delivery_pricing_snapshot.distance_component ?? "0")}</span></div>
              <div className="summary-row"><span>Weight component</span><span>{formatMoney(order.delivery_pricing_snapshot.weight_component ?? "0")}</span></div>
              {order.delivery_pricing_snapshot.surcharges.map((surcharge) => (
                <div className="summary-row" key={surcharge.code}>
                  <span>{surcharge.name}</span><span>{formatMoney(surcharge.amount)}</span>
                </div>
              ))}
              <p className="checkout-note">
                Pricing estimate {order.delivery_pricing_snapshot.formula_version}; route source: {order.delivery_distance_source}.
              </p>
            </>
          ) : null}
          <div className="summary-row"><span>Discount</span><span>−{formatMoney(order.discount)}</span></div>
          <div className="summary-row summary-total"><strong>Total</strong><strong>{formatMoney(order.total)}</strong></div>
          <p className="order-payment-outcome">Payment status: <strong>{order.payment_status.replaceAll("_", " ")}</strong></p>
        </section>
        <aside className="shipping-card">
          <h2>Delivery details</h2>
          <address>
            <strong>{order.shipping_full_name}</strong><br />
            {order.shipping_email}<br />
            {order.shipping_phone}<br /><br />
            {order.shipping_address_line_1}
            {order.shipping_address_line_2 ? <>, {order.shipping_address_line_2}</> : null}<br />
            {order.shipping_city}, {order.shipping_region}
            {order.shipping_postal_code ? ` ${order.shipping_postal_code}` : ""}<br />
            {order.shipping_country}
          </address>
        </aside>
      </div>
      <Link className="text-link order-back-link" href="/account/orders">Back to order history <span aria-hidden="true">→</span></Link>
    </div>
  );
}
