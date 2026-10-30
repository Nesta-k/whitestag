"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useStaffAuth } from "@/store/staff-auth-context";
import { describeAdminError } from "@/lib/api/admin/client";

export default function StaffLoginForm() {
  const { staff, loading, signIn } = useStaffAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && staff) router.replace("/dashboard");
  }, [loading, staff, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch (signInError) {
      setError(describeAdminError(signInError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ws-staff-login">
      <div className="ws-staff-login-card">
        <div className="ws-staff-login-brand">
          <Image
            alt=""
            className="ws-logo-mark"
            height={74}
            src="/logo.svg"
            unoptimized
            width={119}
          />
          <div>
            <strong>WhiteStag</strong>
            <small>Staff console</small>
          </div>
        </div>

        <h1>Sign in to the console</h1>
        <p className="ws-staff-login-note">
          Staff, Admin and Superadmin accounts only. Customer accounts should use
          the storefront sign in.
        </p>

        <form className="ws-staff-login-form" onSubmit={handleSubmit}>
          <label className="ws-dash-field">
            <span className="ws-dash-field-label">Email or username</span>
            <input
              className="ws-dash-input"
              type="text"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="ws-dash-field">
            <span className="ws-dash-field-label">Password</span>
            <input
              className="ws-dash-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? (
            <p className="ws-dash-field-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="ws-dash-btn is-primary"
            disabled={submitting}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <Link href="/" className="ws-staff-login-back">
          ← Back to storefront
        </Link>
      </div>
    </div>
  );
}
