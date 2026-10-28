"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import { useCart } from "@/store/cart-context";
import { useAuth } from "@/store/auth-context";
import type { Product } from "@/types/api";
import { Badge } from "./badge";
import { Button } from "./button";

function formatPrice(price: string | null, currency: string): string {
  if (price === null) return "Ask for a quote";
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
  }).format(Number(price));
}

export function ProductCard({ product }: { product: Product }) {
  const { customer } = useAuth();
  const { addItem } = useCart();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const image = product.images.find((item) => item.is_primary) ?? product.images[0];
  const isPurchasable =
    product.product_type === "spare_part" &&
    product.sales_method === "direct_purchase" &&
    product.price !== null &&
    Number(product.price) > 0 &&
    product.currency === "GHS";

  async function addToCart() {
    if (!customer) {
      setMessage("Sign in to add items to your cart.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await addItem(product.id);
      setMessage("Added to your cart.");
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Could not add this item to your cart.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="product-card">
      <Link
        href={`/products/${encodeURIComponent(product.slug)}`}
        className="product-image-link"
        aria-label={`View ${product.name}`}
      >
        {image ? (
          <div
            className="product-image"
            role="img"
            aria-label={image.alt_text || product.name}
            style={{ backgroundImage: `url("${image.image_url}")` }}
          />
        ) : (
          <div className="product-image product-image-placeholder" aria-hidden="true">
            <span>WS</span>
          </div>
        )}
      </Link>
      <div className="product-card-body">
        <div className="product-card-meta">
          <span className="product-sku">{product.sku}</span>
          {product.brand ? <Badge>{product.brand.name}</Badge> : null}
        </div>
        <h3>
          <Link href={`/products/${encodeURIComponent(product.slug)}`}>
            {product.name}
          </Link>
        </h3>
        <p className="product-category">{product.category.name}</p>
        <div className="product-card-bottom">
          <strong className="product-price">
            {formatPrice(product.price, product.currency)}
          </strong>
          {isPurchasable ? (
            <Button
              type="button"
              variant="outline"
              className="button-small"
              onClick={addToCart}
              disabled={busy}
            >
              {busy ? "Adding…" : "Add"}
            </Button>
          ) : (
            <Button
              href={`/products/${encodeURIComponent(product.slug)}`}
              variant="outline"
              className="button-small"
            >
              View details
            </Button>
          )}
        </div>
        {message ? (
          <p className="product-feedback" role="status">{message}</p>
        ) : null}
      </div>
    </article>
  );
}
