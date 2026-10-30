"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/store/auth-context";
import { useCart } from "@/store/cart-context";

export default function AddToCartButton({
  productId,
}: {
  productId: number;
}) {
  const { user, loading: authLoading } = useAuth();
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");

  async function handleAdd() {
    setAdding(true);
    setMessage("");
    try {
      await addItem(productId);
      setMessage("Added to your cart.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We could not add this item. Please try again.",
      );
    } finally {
      setAdding(false);
    }
  }

  if (!user) {
    return (
      <div>
        <Link className="primary-link" href="/account">
          Sign in to add to cart <span aria-hidden="true">↗</span>
        </Link>
        {authLoading && <p className="form-note">Checking your account…</p>}
      </div>
    );
  }

  return (
    <div>
      <button
        className="primary-link add-to-cart-button"
        type="button"
        onClick={handleAdd}
        disabled={adding}
      >
        {adding ? "Adding…" : "Add to cart"}{" "}
        <span aria-hidden="true">↗</span>
      </button>
      {message && (
        <p aria-live="polite" className="form-note">
          {message}
        </p>
      )}
    </div>
  );
}
