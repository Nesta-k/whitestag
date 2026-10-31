"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { getOrders } from "@/lib/api/orders";
import { formatPrice } from "@/lib/format";
import type { Order } from "@/types/api";
import { useAuth } from "@/store/auth-context";
import GoogleSignInButton from "@/components/account/google-sign-in-button";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.data && typeof error.data === "object") {
    const data = error.data as Record<string, unknown>;
    const firstValue = Object.values(data).find((value) => value !== undefined);
    if (typeof firstValue === "string") return firstValue;
    if (Array.isArray(firstValue) && typeof firstValue[0] === "string") {
      return firstValue[0];
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function AccountPage() {
  const router = useRouter();
  const { user, loading, error: sessionError, signIn, signUp, signOut, signInWithGoogle } =
    useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [googleError, setGoogleError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setOrdersError("");
      return;
    }

    let active = true;
    setOrdersLoading(true);
    setOrdersError("");
    getOrders()
      .then((response) => {
        if (active) setOrders(response.results);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setOrdersError(
            requestError instanceof ApiError
              ? `Your orders could not be loaded (${requestError.status}).`
              : requestError instanceof Error
                ? requestError.message
                : "Your orders could not be loaded. Please try again.",
          );
        }
      })
      .finally(() => {
        if (active) setOrdersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setError("");
      setGoogleError("");
      setSubmitting(true);
      try {
        await signInWithGoogle(credential);
        router.push("/account");
      } catch (signInError) {
        setGoogleError(getErrorMessage(signInError));
      } finally {
        setSubmitting(false);
      }
    },
    [router, signInWithGoogle],
  );

  const handleGoogleError = useCallback((message: string) => {
    setGoogleError(message);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (registering) {
        await signUp({
          email,
          password,
          password_confirm: passwordConfirm,
        });
      } else {
        await signIn(email, password);
      }
      router.push("/account");
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <section className="account-page"><p>Loading your account…</p></section>;
  }

  if (user) {
    const displayName =
      `${user.first_name} ${user.last_name}`.trim() || user.email.split("@")[0];
    const initials = `${user.first_name} ${user.last_name}`
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase() || user.email.slice(0, 1).toUpperCase();
    const recentOrders = orders.slice(0, 5);

    return (
      <section className="customer-dashboard">
        <div className="customer-dashboard-heading">
          <div>
            <p className="eyebrow">YOUR WHITESTAG ACCOUNT</p>
            <h1>Welcome back, {displayName}.</h1>
            <p>Manage your orders, saved items, and shopping from one place.</p>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </div>

        <div className="customer-account-card">
          <span className="customer-avatar" aria-hidden="true">{initials}</span>
          <div>
            <strong>{displayName}</strong>
            <span>{user.email}</span>
          </div>
          <span className="customer-account-status">Customer account</span>
        </div>

        <nav className="customer-shortcuts" aria-label="Account shortcuts">
          <Link href="/cart">
            <span className="customer-shortcut-icon" aria-hidden="true">01</span>
            <span><strong>Your cart</strong><small>Review items and checkout</small></span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link href="/wishlist">
            <span className="customer-shortcut-icon" aria-hidden="true">02</span>
            <span><strong>Saved to buy</strong><small>Products ready for online purchase</small></span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link href="/wishlist/quotes">
            <span className="customer-shortcut-icon" aria-hidden="true">03</span>
            <span><strong>Saved for a quote</strong><small>Vehicles and specialist items</small></span>
            <span aria-hidden="true">→</span>
          </Link>
        </nav>

        <section className="customer-orders">
          <div className="customer-section-heading">
            <div>
              <p className="eyebrow">ORDER HISTORY</p>
              <h2>Your recent orders</h2>
            </div>
            <Link href="/products">Continue shopping <span aria-hidden="true">↗</span></Link>
          </div>

          {ordersLoading ? (
            <p className="customer-orders-message">Loading your orders…</p>
          ) : ordersError ? (
            <div className="customer-orders-message is-error" role="alert">
              <p>{ordersError}</p>
              <button
                type="button"
                onClick={() => {
                  setOrdersLoading(true);
                  setOrdersError("");
                  getOrders()
                    .then((response) => setOrders(response.results))
                    .catch((requestError: unknown) => {
                      setOrdersError(
                        requestError instanceof Error
                          ? requestError.message
                          : "Your orders could not be loaded. Please try again.",
                      );
                    })
                    .finally(() => setOrdersLoading(false));
                }}
              >
                Try again
              </button>
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="customer-orders-empty">
              <div>
                <strong>No orders yet</strong>
                <p>Your orders will appear here after you complete checkout.</p>
              </div>
              <Link className="primary-link" href="/products">
                Explore the shop <span aria-hidden="true">↗</span>
              </Link>
            </div>
          ) : (
            <div className="customer-order-list">
              {recentOrders.map((order) => (
                <article className="customer-order" key={order.public_reference}>
                  <div className="customer-order-main">
                    <strong>Order {order.public_reference}</strong>
                    <span>
                      {new Date(order.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                      {" · "}
                      {order.items.length} {order.items.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <div className="customer-order-payment">
                    <span className={`customer-order-status is-${order.status}`}>
                      {order.status.replaceAll("_", " ")}
                    </span>
                    <span className={`customer-order-status is-payment-${order.payment_status}`}>
                      {order.payment_status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <strong className="customer-order-total">
                    {formatPrice(order.total, order.currency)}
                  </strong>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  return (
    <section className="account-page">
      <p className="eyebrow">{registering ? "JOIN WHITESTAG" : "WELCOME BACK"}</p>
      <h1>{registering ? "Create your account." : "Sign in to continue."}</h1>
      <p className="account-intro">
        {registering
          ? "Create an account to keep your cart and orders together."
          : "Sign in to manage your cart and orders."}
      </p>
      {sessionError && (
        <p className="form-error" role="alert">
          {sessionError}
        </p>
      )}
      {googleEnabled && (
        <>
          <GoogleSignInButton
            onCredential={handleGoogleCredential}
            onError={handleGoogleError}
          />
          {googleError && (
            <p className="form-error" role="alert">
              {googleError}
            </p>
          )}
          <div className="account-divider">
            <span>or</span>
          </div>
        </>
      )}
      <form className="account-form" onSubmit={handleSubmit}>
        <label>
          Email address
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={registering ? "new-password" : "current-password"}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {registering && (
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              required
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
            />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-link account-submit" disabled={submitting}>
          {submitting
            ? "Please wait…"
            : registering
              ? "Create account"
              : "Sign in"}
          {!submitting && <span aria-hidden="true">↗</span>}
        </button>
      </form>
      <p className="account-switch">
        {registering ? "Already have an account?" : "New to WhiteStag?"}{" "}
        <button
          type="button"
          onClick={() => {
            setRegistering(!registering);
            setError("");
            setGoogleError("");
          }}
        >
          {registering ? "Sign in" : "Create an account"}
        </button>
      </p>
    </section>
  );
}
