"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getProduct } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";
import { useCart } from "@/store/cart-context";
import { useAuth } from "@/store/auth-context";
import type { Product } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const { customer } = useAuth();
  const { addItem } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const loadProduct = useCallback(() => {
    let active = true;
    setProduct(null);
    setError("");
    getProduct(params.slug)
      .then((result) => {
        if (active) {
          setProduct(result);
          const primaryIndex = result.images.findIndex((item) => item.is_primary);
          setSelectedImageIndex(Math.max(0, primaryIndex));
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : "Could not load this product.",
          );
        }
      });
    return () => { active = false; };
  }, [params.slug]);

  useEffect(() => loadProduct(), [loadProduct]);

  async function addToCart() {
    if (!product || !customer) {
      setMessage("Sign in to add this part to your cart.");
      return;
    }
    setBusy(true);
    try {
      await addItem(product.id);
      setMessage("Added to your cart.");
    } catch (requestError) {
      setMessage(requestError instanceof ApiError ? requestError.message : "Could not add this part.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <div className="page-container section-space"><ErrorState message={error} onRetry={() => loadProduct()} /></div>;
  }
  if (!product) {
    return <div className="page-container section-space"><Skeleton className="detail-skeleton" /></div>;
  }

  const primaryImageIndex = Math.max(
    0,
    product.images.findIndex((item) => item.is_primary),
  );
  const selectedImage = product.images[selectedImageIndex] ?? product.images[primaryImageIndex];
  const directPurchase =
    product.product_type === "spare_part" &&
    product.sales_method === "direct_purchase" &&
    product.price !== null &&
    Number(product.price) > 0 &&
    product.currency === "GHS";
  const salesEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  const quoteHref = salesEmail
    ? `mailto:${salesEmail}?subject=${encodeURIComponent(`Quote enquiry: ${product.name}`)}`
    : product.product_type === "car" ||
        product.product_type === "electric_vehicle" ||
        product.product_type === "tricycle"
      ? "/vehicles"
      : null;

  return (
    <div className="page-container section-space">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link><span>/</span><Link href="/products">Parts</Link><span>/</span><span>{product.name}</span>
      </nav>
      <div className="product-detail">
        <div>
          <div className="detail-image-wrap">
            {selectedImage ? (
              // Catalogue image URLs are supplied by the backend.
              <div className="detail-image" role="img" aria-label={selectedImage.alt_text || product.name} style={{ backgroundImage: `url("${selectedImage.image_url}")` }} />
            ) : <div className="detail-image product-image-placeholder" aria-hidden="true"><span>WS</span></div>}
          </div>
          {product.images.length > 1 ? (
            <div className="image-gallery" aria-label="Product images">
              {product.images.map((image, index) => (
                <button
                  type="button"
                  className={`image-thumbnail ${index === selectedImageIndex ? "is-selected" : ""}`}
                  aria-label={`View image ${index + 1} of ${product.images.length}`}
                  aria-pressed={index === selectedImageIndex}
                  key={`${image.image_url}-${index}`}
                  onClick={() => setSelectedImageIndex(index)}
                  style={{ backgroundImage: `url("${image.image_url}")` }}
                />
              ))}
            </div>
          ) : null}
        </div>
        <div className="detail-copy">
          <div className="product-card-meta"><span className="product-sku">SKU {product.sku}</span>{product.brand ? <Badge>{product.brand.name}</Badge> : null}</div>
          <Link className="eyebrow detail-category-link" href={`/categories/${encodeURIComponent(product.category.slug)}`}>{product.category.name}</Link>
          <h1>{product.name}</h1>
          {product.description ? <p className="detail-description">{product.description}</p> : null}
          <div className="detail-price">
            {product.price === null
              ? "Contact us for a quote"
              : new Intl.NumberFormat("en-GH", { style: "currency", currency: product.currency }).format(Number(product.price))}
          </div>
          <p className="detail-availability">
            {directPurchase
              ? "Stock availability is confirmed by WhiteStag when you add this part and again at checkout."
              : "This item is not available for direct online purchase. Contact WhiteStag for availability and a quote."}
          </p>
          {directPurchase
            ? <Button type="button" onClick={addToCart} disabled={busy}>{busy ? "Adding…" : "Add to cart"}</Button>
            : quoteHref
              ? <Button href={quoteHref} variant="outline">Request a quote</Button>
              : <Button type="button" variant="outline" disabled>Quote contact not configured</Button>}
          {!directPurchase && !quoteHref ? <p className="checkout-note">WhiteStag sales contact details have not been configured for quote requests.</p> : null}
          {message ? <p role="status" className="product-feedback">{message}</p> : null}
          <div className="detail-trust"><span>✓ Secure payment</span><span>✓ Trusted parts</span><span>✓ Local support</span></div>
        </div>
      </div>
      {product.specifications.length ? (
        <section className="specifications">
          <p className="eyebrow">Product information</p><h2>Specifications</h2>
          <dl>{product.specifications.map((spec) => <div key={spec.name}><dt>{spec.name}</dt><dd>{spec.value}</dd></div>)}</dl>
        </section>
      ) : null}
    </div>
  );
}
