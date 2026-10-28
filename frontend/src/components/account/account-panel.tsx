"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/store/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GoogleSignInButton } from "@/components/account/google-sign-in-button";

export function AccountPanel() {
  const router = useRouter();
  const {
    customer,
    isLoading,
    authError,
    signIn,
    signInWithGoogle,
    signUp,
    signOut,
    refreshCustomer,
  } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function completeSignIn(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      const requestedPath = new URLSearchParams(window.location.search).get("next");
      if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//")) {
        router.replace(requestedPath);
      }
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "We could not complete sign-in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await completeSignIn(() =>
      mode === "login"
        ? signIn(email, password)
        : signUp(email, password, passwordConfirm),
    );
  }

  async function submitGoogleCredential(credential: string) {
    await completeSignIn(() => signInWithGoogle(credential));
  }

  function showGoogleError(message: string) {
    setError(message);
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await signOut();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "We could not confirm sign-out with the server. Your local session has been cleared.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return <Card className="account-card"><p>Checking your account…</p></Card>;
  }

  if (customer) {
    return (
      <Card className="account-card">
        <p className="eyebrow">Your WhiteStag account</p>
        <h1>Welcome back.</h1>
        <p className="account-intro">You are signed in as <strong>{customer.email}</strong>.</p>
        <div className="account-actions">
          <Button href="/account/orders">View my orders</Button>
          <Button href="/cart" variant="outline">View my cart</Button>
          <Button type="button" variant="ghost" onClick={() => void logout()} disabled={busy}>Sign out</Button>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </Card>
    );
  }

  return (
    <Card className="account-card">
      <p className="eyebrow">{mode === "login" ? "Welcome to WhiteStag" : "Join WhiteStag"}</p>
      <h1>{mode === "login" ? "Sign in to your account" : "Create your account"}</h1>
      <p className="account-intro">
        {mode === "login"
          ? "Sign in to manage your cart and keep track of your orders."
          : "Create an account to save your cart and follow your orders."}
      </p>
      {authError ? (
        <div className="auth-error" role="alert">
          <p className="form-error">{authError}</p>
          <Button type="button" variant="ghost" onClick={() => void refreshCustomer()}>Retry account check</Button>
        </div>
      ) : null}
      <div className="auth-tabs" role="tablist" aria-label="Account action">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={mode === "login" ? "is-selected" : ""}
          onClick={() => { setMode("login"); setError(""); }}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={mode === "register" ? "is-selected" : ""}
          onClick={() => { setMode("register"); setError(""); }}
        >
          Register
        </button>
      </div>
      <GoogleSignInButton
        disabled={busy}
        onCredential={submitGoogleCredential}
        onError={showGoogleError}
      />
      <div className="auth-divider" aria-hidden="true"><span>OR</span></div>
      <form className="form-stack" onSubmit={submit}>
        <Input
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {mode === "register" ? (
          <Input
            label="Confirm password"
            name="password_confirm"
            type="password"
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            required
          />
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <p className="privacy-note">
        Your account uses WhiteStag&apos;s secure sign-in. <Link href="/products">Browse without signing in</Link>.
      </p>
    </Card>
  );
}
