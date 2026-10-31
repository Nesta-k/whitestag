"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { useAuth } from "@/store/auth-context";
import { useCart } from "@/store/cart-context";

export default function CartPage() {
  const { user } = useAuth();
  const { cart, loading, error, updateItem, removeItem } = useCart();
  const [actionError, setActionError] = useState("");
  const [busyItem, setBusyItem] = useState<number | null>(null);

  async function changeQuantity(itemId: number, quantity: number) {
    setActionError("");
    setBusyItem(itemId);
    try {
      await updateItem(itemId, quantity);
    } catch (updateError) {
      setActionError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update this item.",
      );
    } finally {
      setBusyItem(null);
    }
  }

  async function deleteItem(itemId: number) {
    setActionError("");
    setBusyItem(itemId);
    try {
      await removeItem(itemId);
    } catch (removeError) {
      setActionError(
        removeError instanceof Error
          ? removeError.message
          : "Could not remove this item.",
      );
    } finally {
      setBusyItem(null);
    }
  }

  return (
    <section className="cart-page">
      <p className="eyebrow">YOUR SELECTION</p>
      <h1>Your cart</h1>
      {!user ? (
        <div className="catalogue-message">
          <h2>Sign in to see your cart</h2>
          <p>Your cart is saved to your WhiteStag account.</p>
          <Link className="primary-link" href="/account">
            Sign in <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : loading && !cart ? (
        <p className="form-note">Loading your cart…</p>
      ) : error ? (
        <div className="catalogue-message" role="alert">
          <h2>Cart unavailable</h2>
          <p>{error}</p>
        </div>
      ) : !cart?.items.length ? (
        <div className="catalogue-message">
          <h2>Your cart is empty</h2>
          <p>Explore the catalogue and add something useful for the road ahead.</p>
          <Link className="primary-link" href="/products">
            Browse the catalogue <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : (
        <>
          {actionError && (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          )}
          <div className="cart-items">
            {cart.items.map((item) => (
              <article className="cart-item" key={item.id}>
                <Link
                  className="cart-item-image"
                  href={item.product ? `/products/${item.product.slug}` : "/products"}
                  aria-label={
                    item.product ? `View ${item.product.name}` : "Browse catalogue"
                  }
                >
                  {item.product?.image_url ? (
                    <Image
                      src={item.product.image_url}
                      alt={item.product.name}
                      fill
                      sizes="150px"
                      unoptimized
                    />
                  ) : (
                    <span
                      className="product-image-placeholder"
                      aria-hidden="true"
                    >
                      WS
                    </span>
                  )}
                </Link>
                <div className="cart-item-info">
                  <h2>
                    {item.product?.name ?? "Item no longer available"}
                  </h2>
                  {item.product?.price && (
                    <p>{formatPrice(item.product.price, item.product.currency)}</p>
                  )}
                  {!item.is_available && (
                    <p className="availability-note">
                      This item is currently unavailable in the requested quantity.
                    </p>
                  )}
                  <div className="cart-item-actions">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      disabled={busyItem === item.id || item.quantity <= 1}
                      onClick={() => changeQuantity(item.id, item.quantity - 1)}
                    >
                      −
                    </button>
                    <span aria-label={`Quantity ${item.quantity}`}>
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      disabled={busyItem === item.id}
                      onClick={() => changeQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </button>
                    <button
                      className="cart-remove"
                      type="button"
                      disabled={busyItem === item.id}
                      onClick={() => deleteItem(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <p className="cart-note">
            Prices and availability are confirmed when you continue to checkout.
          </p>
          <Link className="primary-link" href="/checkout">
            Proceed to checkout <span aria-hidden="true">→</span>
          </Link>
        </>
      )}
    </section>
  );
}
