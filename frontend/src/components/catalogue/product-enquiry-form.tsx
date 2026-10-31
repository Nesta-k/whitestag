"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { submitVehicleEnquiry } from "@/lib/api/enquiries";

interface ProductEnquiryFormProps {
  product: {
    id: number;
    name: string;
    sku: string;
    slug: string;
  };
}

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

export default function ProductEnquiryForm({
  product,
}: ProductEnquiryFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await submitVehicleEnquiry({
        product: product.id,
        name: name.trim(),
        email: email.trim(),
        phone_number: phoneNumber.trim(),
        message: message.trim(),
      });
      setSubmitted(true);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section className="account-page">
        <p className="eyebrow">ENQUIRY SENT</p>
        <h1>Thank you.</h1>
        <p className="account-intro" role="status">
          Your enquiry about {product.name} has been sent to our team. We’ll be
          in touch using the contact details you provided.
        </p>
        <Link className="primary-link" href={`/products/${product.slug}`}>
          Back to {product.name}
        </Link>
      </section>
    );
  }

  return (
    <section className="account-page">
      <Link className="text-link" href={`/products/${product.slug}`}>
        ← Back to {product.name}
      </Link>
      <p className="eyebrow product-enquiry-eyebrow">PRODUCT ENQUIRY</p>
      <h1>How can we help?</h1>
      <p className="account-intro">
        Send us your details and a message about{" "}
        <strong>{product.name}</strong> (SKU {product.sku}). Our team will follow
        up with you.
      </p>
      <form className="account-form" onSubmit={handleSubmit}>
        <label>
          Full name
          <input
            type="text"
            autoComplete="name"
            maxLength={255}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
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
          Phone number
          <input
            type="tel"
            autoComplete="tel"
            maxLength={20}
            required
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
          />
        </label>
        <label>
          Message
          <textarea
            required
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="primary-link account-submit" disabled={submitting}>
          {submitting ? "Sending…" : "Send enquiry"}
          {!submitting && <span aria-hidden="true">↗</span>}
        </button>
      </form>
    </section>
  );
}
