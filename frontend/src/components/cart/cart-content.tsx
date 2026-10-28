"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/store/cart-context";
import { useAuth } from "@/store/auth-context";
import { getProduct } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";
import type { Product } from "@/types/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { QuantityControl } from "@/components/ui/quantity-control";
import { Skeleton } from "@/components/ui/skeleton";

function money(value: string | number, currency: string) {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
  }).format(Number(value));
}

export function CartContent() {
  const { customer, isLoading: authLoading } = useAuth();
  const { cart, isLoading, error, refresh, updateQuantity, removeItem } = useCart();
  const [actionError, setActionError] = useState("");
  const [productDetails, setProductDetails] = useState<Record<string, Product>>({});
  const [imageError, setImageError] = useState("");
  const [busyItemId, setBusyItemId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const slugs = [...new Set(
      (cart?.items ?? [])
        .map((item) => item.product?.slug)
        .filter((slug): slug is string => Boolean(slug)),
    )];
    if (!slugs.length) {
      setProductDetails({});
      return () => { active = false; };
    }

    void Promise.all(
      slugs.map(async (slug) => {
        try {
          return [slug, await getProduct(slug)] as const;
        } catch {
          return [slug, null] as const;
        }
      }),
    ).then((results) => {
      if (!active) return;
      const details: Record<string, Product> = {};
      let failed = false;
      for (const [slug, product] of results) {
        if (product) details[slug] = product;
        else failed = true;
      }
      setProductDetails(details);
      setImageError(failed ? "Some product images could not be loaded." : "");
    });
    return () => { active = false; };
  }, [cart?.items]);

  async function update(itemId: number, quantity: number) {
    if (busyItemId !== null) return;
    setBusyItemId(itemId);
    setActionError("");
    try {
      await updateQuantity(itemId, quantity);
    } catch (requestError) {
      setActionError(
        requestError instanceof ApiError
          ? requestError.message
          : "Could not update your cart.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function remove(itemId: number) {
    if (busyItemId !== null) return;
    setBusyItemId(itemId);
    setActionError("");
    try {
      await removeItem(itemId);
    } catch (requestError) {
      setActionError(
        requestError instanceof ApiError
          ? requestError.message
          : "Could not remove this item.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="page-container section-space">
        <Skeleton className="cart-skeleton" />
      </div>
    );
  }
  if (!customer) {
    return (
      <div className="page-container section-space">
        <EmptyState
          title="Sign in to view your cart"
          description="Your cart is connected to your WhiteStag account."
          action={<Button href="/account">Sign in</Button>}
        />
      </div>
    );
  }
  if (error) {
    return <div className="page-container section-space"><ErrorState message={error} onRetry={() => void refresh()} /></div>;
  }
  if (!cart?.items.length) {
    return (
      <div className="page-container section-space">
        <EmptyState
          title="Your cart is ready for parts"
          description="Browse the catalogue and add parts you need. Prices and availability are confirmed by the backend."
          action={<Button href="/products">Browse parts</Button>}
        />
      </div>
    );
  }

  const total = cart.items.reduce((sum, item) => {
    if (!item.product?.price) return sum;
    return sum + Number(item.product.price) * item.quantity;
  }, 0);
  const currency = cart.items.find((item) => item.product)?.product?.currency ?? "GHS";
  const canCheckout = cart.items.every(
    (item) => item.product !== null && item.is_available,
  );

  return (
    <div className="page-container section-space">
      <div className="page-heading">
        <div><p className="eyebrow">Your selection</p><h1>Shopping cart</h1></div>
        <Link className="text-link" href="/products">Continue shopping <span aria-hidden="true">→</span></Link>
      </div>
      <div className="cart-layout">
        <div className="cart-lines">
          {imageError ? <p className="availability-warning" role="status">{imageError}</p> : null}
          {cart.items.map((item) => {
            const image = item.product
              ? productDetails[item.product.slug]?.images.find((entry) => entry.is_primary)
                ?? productDetails[item.product.slug]?.images[0]
              : undefined;
            return (
              <article className="cart-line" key={item.id}>
                {image ? (
                  <div
                    className="cart-item-art cart-item-image"
                    role="img"
                    aria-label={image.alt_text || item.product?.name || "Cart item"}
                    style={{ backgroundImage: `url("${image.image_url}")` }}
                  />
                ) : <div className="cart-item-art" aria-hidden="true">WS</div>}
                <div className="cart-line-info">
                  <h2>{item.product?.name ?? "Unavailable product"}</h2>
                  {item.product ? <p>{item.product.product_type.replaceAll("_", " ")}</p> : null}
                  {!item.is_available ? <p className="availability-warning">Availability needs confirmation</p> : null}
                  {item.product?.price ? (
                    <>
                      <small>{money(item.product.price, item.product.currency)} each</small>
                      <strong>{money(Number(item.product.price) * item.quantity, item.product.currency)}</strong>
                    </>
                  ) : null}
                </div>
                <QuantityControl
                  value={item.quantity}
                  onChange={(quantity) => void update(item.id, quantity)}
                  disabled={!item.product || busyItemId !== null}
                />
                <button type="button" className="remove-link" onClick={() => void remove(item.id)} disabled={busyItemId !== null}>
                  Remove
                </button>
              </article>
            );
          })}
          {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
        </div>
        <aside className="cart-summary">
          <h2>Order summary</h2>
          <div className="summary-row"><span>Items</span><span>{cart.item_count}</span></div>
          <div className="summary-row"><span>Estimated subtotal</span><strong>{money(total.toFixed(2), currency)}</strong></div>
          <div className="summary-row summary-total"><strong>Estimated total</strong><strong>{money(total.toFixed(2), currency)}</strong></div>
          <p>This estimate excludes any delivery fee or adjustments. The backend calculates the final order total and rechecks stock at checkout.</p>
          {!canCheckout ? <p className="availability-warning" role="status">Resolve unavailable items before proceeding to checkout.</p> : null}
          {canCheckout
            ? <Button href="/checkout">Proceed to checkout</Button>
            : <Button type="button" disabled>Proceed to checkout</Button>}
        </aside>
      </div>
    </div>
  );
}
