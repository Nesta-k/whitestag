"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useState } from "react";
import { ApiError } from "@/lib/api/client";
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
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [googleError, setGoogleError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setError("");
      setGoogleError("");
      setSubmitting(true);
      try {
        await signInWithGoogle(credential);
        router.push("/cart");
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
      router.push("/cart");
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
    return (
      <section className="account-page">
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1>Welcome back.</h1>
        <p className="account-email">{user.email}</p>
        <div className="account-actions">
          <Link className="primary-link" href="/cart">
            Go to your cart <span aria-hidden="true">↗</span>
          </Link>
          <button className="secondary-button" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
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
