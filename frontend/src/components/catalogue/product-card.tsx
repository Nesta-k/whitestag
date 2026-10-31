"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/types/api";
import { formatPrice } from "@/lib/format";
import { describeCartActionError } from "@/lib/api/cart";
import { useAuth } from "@/store/auth-context";
import { useCart } from "@/store/cart-context";
import { useWishlist } from "@/store/wishlist-context";

function isPurchasable(product: Product): boolean {
  return (
    product.sales_method === "direct_purchase" &&
    product.price !== null &&
    Number(product.price) > 0 &&
    product.currency === "GHS"
  );
}

export default function ProductCard({ product }: { product: Product }) {
  const image = product.images[0];
  const { user } = useAuth();
  const { addItem } = useCart();
  const { isSaved, toggle } = useWishlist();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const purchasable = isPurchasable(product);
  const saved = isSaved(product.id);
  const detailHref = `/products/${product.slug}`;

  async function handleAdd() {
    setAdding(true);
    setMessage("");
    try {
      await addItem(product.id);
      setMessage("Added to your cart.");
    } catch (error) {
      setMessage(describeCartActionError(error));
    } finally {
      setAdding(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      await toggle(product.id);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We could not update your wishlist.",
      );
    } finally {
      setSaving(false);
    }
  }

  const primaryAction = purchasable ? (
    user ? (
      <button className="card-button" type="button" onClick={handleAdd} disabled={adding}>
        {adding ? "Adding…" : "Add to cart"}
      </button>
    ) : (
      <Link className="card-button" href="/account">
        Add to cart
      </Link>
    )
  ) : (
    <Link className="card-button" href={detailHref}>
      {product.sales_method === "quotation" ? "Request a quote" : "View details"}
    </Link>
  );

  return (
    <article className="product-card">
      <div className="product-card-media">
        <Link className="product-card-image" href={detailHref} aria-label={`View ${product.name}`}>
          {image ? (
            <Image
              src={image.image_url}
              alt={image.alt_text || product.name}
              fill
              sizes="(max-width: 560px) 50vw, (max-width: 1100px) 33vw, (max-width: 1500px) 25vw, 20vw"
              unoptimized
            />
          ) : (
            <span className="product-image-placeholder" aria-hidden="true">
              WS
            </span>
          )}
        </Link>
        {user ? (
          <button
            className={`card-wishlist${saved ? " is-saved" : ""}`}
            type="button"
            onClick={handleSave}
            disabled={saving}
            aria-pressed={saved}
            aria-label={
              saved
                ? `Remove ${product.name} from your wishlist`
                : `Save ${product.name} to your wishlist`
            }
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 7.8a4.2 4.2 0 0 1 7 2.9C19 15.6 12 20 12 20Z"
                fill={saved ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <Link
            className="card-wishlist"
            href="/account"
            aria-label="Sign in to save items to your wishlist"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 7.8a4.2 4.2 0 0 1 7 2.9C19 15.6 12 20 12 20Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        )}
      </div>

      <div className="product-card-copy">
        <p className="product-card-meta">
          {product.brand?.name ?? product.category.name}
        </p>
        <h2 className="product-card-title">
          <Link href={detailHref}>{product.name}</Link>
        </h2>
        <p className="product-card-sku">SKU {product.sku}</p>
        <p className="product-card-price">
          {formatPrice(product.price, product.currency)}
        </p>
        <div className="product-card-actions">
          {primaryAction}
          <Link className="card-link" href={detailHref} aria-label={`View ${product.name}`}>
            ↗
          </Link>
        </div>
        {message && (
          <p className="product-card-note" aria-live="polite">
            {message}
          </p>
        )}
      </div>
    </article>
  );
}
