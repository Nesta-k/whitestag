"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { verifyPayment } from "@/lib/api/orders";
import { useAuth } from "@/store/auth-context";

interface VerificationResult {
  outcome: string;
  status: string;
}

export default function PaymentReturn({ reference }: { reference: string }) {
  const { user, loading: authLoading } = useAuth();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (authLoading || !user || !reference) return;
    let active = true;
    setVerifying(true);
    setError("");
    verifyPayment(reference)
      .then((verification) => {
        if (active) setResult(verification);
      })
      .catch((verificationError: unknown) => {
        if (!active) return;
        if (verificationError instanceof ApiError) {
          setError(
            `We could not confirm this payment (error ${verificationError.status}).`,
          );
        } else {
          setError(
            verificationError instanceof Error
              ? verificationError.message
              : "We could not confirm this payment.",
          );
        }
      })
      .finally(() => {
        if (active) setVerifying(false);
      });
    return () => {
      active = false;
    };
  }, [authLoading, user, reference, retry]);

  const paid = result?.outcome === "succeeded" || result?.status === "succeeded";

  return (
    <section className="checkout-page checkout-complete">
      <p className="eyebrow">PAYMENT STATUS</p>
      <h1>{paid ? "Payment confirmed" : "Confirming your payment"}</h1>
      {authLoading || verifying ? (
        <p className="form-note">Checking your payment securely…</p>
      ) : !user ? (
        <div className="catalogue-message">
          <h2>Sign in to confirm your payment</h2>
          <p>
            Use the account you checked out with, then return here to verify the
            Paystack transaction.
          </p>
          <Link className="primary-link" href="/account">
            Sign in <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : !reference ? (
        <div className="catalogue-message" role="alert">
          <h2>Missing payment reference</h2>
          <p>We could not find a Paystack reference to verify.</p>
        </div>
      ) : paid ? (
        <div className="catalogue-message">
          <h2>Thank you for your order</h2>
          <p>Payment reference: {reference}</p>
          <Link className="primary-link" href="/products">
            Continue shopping <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : error ? (
        <div className="catalogue-message" role="alert">
          <h2>Payment needs confirmation</h2>
          <p>{error}</p>
          <button
            className="primary-link"
            type="button"
            disabled={verifying}
            onClick={() => {
              setResult(null);
              setRetry((value) => value + 1);
            }}
          >
            Try verification again
          </button>
        </div>
      ) : (
        <div className="catalogue-message">
          <h2>Payment not confirmed</h2>
          <p>
            Paystack returned status “{result?.status ?? "unknown"}”. If you
            completed payment, retry verification before contacting support.
          </p>
          <button
            className="primary-link"
            type="button"
            disabled={verifying}
            onClick={() => {
              setResult(null);
              setRetry((value) => value + 1);
            }}
          >
            Retry verification
          </button>
        </div>
      )}
    </section>
  );
}
