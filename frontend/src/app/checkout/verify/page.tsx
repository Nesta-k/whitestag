"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { verifyPayment } from "@/lib/api/orders";
import type { PaymentVerification } from "@/types/api";
import {
  getLatestPaymentReference,
  getOrderReferenceForPayment,
} from "@/lib/payments";
import { useAuth } from "@/store/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

function outcomeCopy(result: PaymentVerification): {
  title: string;
  message: string;
  tone: string;
} {
  if (result.outcome === "succeeded" && result.status === "succeeded") {
    return {
      title: "Payment confirmed",
      message: "WhiteStag has verified your payment. Your order status is available in your account.",
      tone: "payment-success",
    };
  }
  if (result.status === "failed" || result.status === "abandoned") {
    return {
      title: "Payment was not completed",
      message: "The order is not marked as paid. You can review it in your account or contact WhiteStag if you believe this is incorrect.",
      tone: "payment-failed",
    };
  }
  if (result.outcome === "refund_required" || result.outcome === "reconciliation_required") {
    return {
      title: "Payment needs staff review",
      message: "The payment could not be matched to a normal order settlement. Do not retry the charge; contact WhiteStag support.",
      tone: "payment-review",
    };
  }
  return {
    title: "Payment is still pending",
    message: "The provider has not confirmed a final outcome. This is not a successful payment. Check again shortly or review your order.",
    tone: "payment-pending",
  };
}

export default function PaymentVerificationPage() {
  const { customer, isLoading: authLoading } = useAuth();
  const [reference, setReference] = useState("");
  const [result, setResult] = useState<PaymentVerification | null>(null);
  const [orderReference, setOrderReference] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const verify = useCallback(async (paymentReference: string) => {
    setIsVerifying(true);
    setError("");
    try {
      const verified = await verifyPayment(paymentReference);
      setResult(verified);
    } catch (requestError) {
      setResult(null);
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "We could not confirm the payment status. Do not treat this as successful.",
      );
    } finally {
      setIsVerifying(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const query = new URLSearchParams(window.location.search);
    const callbackReference = query.get("reference") || query.get("trxref");
    const storedReference = getLatestPaymentReference();
    const initialReference = callbackReference || storedReference || "";
    setOrderReference(
      initialReference
        ? getOrderReferenceForPayment(initialReference) ?? ""
        : "",
    );
    setReference(initialReference);
    setIsInitializing(false);
    if (customer && initialReference) void verify(initialReference);
  }, [authLoading, customer, verify]);

  if (authLoading || isInitializing || isVerifying && !result && !error) {
    return <div className="page-container section-space"><Skeleton className="verification-skeleton" /></div>;
  }
  if (!customer) {
    return (
      <div className="page-container section-space">
        <EmptyState
          title="Sign in to verify your payment"
          description="Payment verification is available only to the customer account that placed the order."
          action={<Button href={`/account?next=${encodeURIComponent(`/checkout/verify${reference ? `?reference=${encodeURIComponent(reference)}` : ""}`)}`}>Sign in</Button>}
        />
      </div>
    );
  }
  if (!reference) {
    return (
      <div className="page-container section-space">
        <EmptyState
          title="No payment attempt found"
          description="Open the order you want to check. WhiteStag can verify only a payment attempt created for your account."
          action={<Button href="/account/orders">View my orders</Button>}
        />
      </div>
    );
  }

  const outcome = result ? outcomeCopy(result) : null;

  return (
    <div className="page-container section-space">
      <div className="page-heading">
        <div><p className="eyebrow">Payment status</p><h1>{outcome?.title ?? "Could not verify payment"}</h1></div>
        {result ? <Badge>{result.status.replaceAll("_", " ")}</Badge> : null}
      </div>
      {error ? <ErrorState message={error} onRetry={() => void verify(reference)} /> : null}
      {outcome ? (
        <section className={`payment-result ${outcome.tone}`} aria-live="polite">
          <span className="payment-result-mark" aria-hidden="true">
            {result?.outcome === "succeeded" && result.status === "succeeded" ? "✓" : "!"}
          </span>
          <div>
            <h2>{outcome.title}</h2>
            <p>{outcome.message}</p>
            <p className="payment-reference">Payment reference: <code>{reference}</code></p>
            {isVerifying ? <p role="status">Checking with WhiteStag…</p> : null}
          </div>
        </section>
      ) : null}
      <div className="payment-actions">
        <Button type="button" variant="outline" disabled={isVerifying} onClick={() => void verify(reference)}>
          {isVerifying ? "Checking…" : "Check status again"}
        </Button>
        {orderReference ? <Button href={`/account/orders/${encodeURIComponent(orderReference)}`}>View order</Button> : null}
        <Link className="text-link" href="/account/orders">Order history <span aria-hidden="true">→</span></Link>
      </div>
      {!result && !error ? <p className="checkout-note">A pending or inconclusive result is never displayed as paid.</p> : null}
    </div>
  );
}
