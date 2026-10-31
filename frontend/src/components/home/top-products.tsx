"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import ProductCard from "@/components/catalogue/product-card";
import { getProducts } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";
import type { Category, HomepageSettings, Product } from "@/types/api";

export default function TopProducts({
  settings,
  initialProducts,
  categories,
}: {
  settings: HomepageSettings;
  initialProducts: Product[];
  categories: Category[];
}) {
  const tabs = useMemo(
    () => [
      { slug: "", name: "All products" },
      ...categories.slice(0, 6).map((category) => ({
        slug: category.slug,
        name: category.name,
      })),
    ],
    [categories],
  );

  const [active, setActive] = useState("");
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const select = useCallback(
    async (slug: string) => {
      setActive(slug);
      setError("");
      if (!slug) {
        setProducts(initialProducts);
        return;
      }
      setLoading(true);
      try {
        const data = await getProducts({
          category: slug,
          sales_method: "direct_purchase",
        });
        setProducts(data.results);
      } catch (requestError) {
        setProducts([]);
        setError(
          requestError instanceof ApiError
            ? `The catalogue service returned an error (${requestError.status}).`
            : "We could not load this collection. Please try again.",
        );
      } finally {
        setLoading(false);
      }
    },
    [initialProducts],
  );

  return (
    <section className="ws-section ws-top-products" id="featured-products">
      <div className="ws-section-head ws-section-head-row">
        <div>
          <p className="eyebrow">{settings.featured_products_eyebrow}</p>
          <h2>{settings.featured_products_heading}</h2>
        </div>
        <div className="ws-tabs">
          {tabs.map((tab) => (
            <button
              className={`ws-tab${active === tab.slug ? " is-active" : ""}`}
              key={tab.slug || "all"}
              type="button"
              aria-pressed={active === tab.slug}
              onClick={() => select(tab.slug)}
            >
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="catalogue-message" role="alert">
          <h2>Collection unavailable</h2>
          <p>{error}</p>
        </div>
      ) : loading ? (
        <p className="ws-collection-status" aria-live="polite">
          Loading products…
        </p>
      ) : products.length > 0 ? (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="catalogue-message">
          <h2>Nothing published here yet</h2>
          <p>
            There are no published products in this collection right now. Browse
            the full catalogue instead.
          </p>
          <Link className="text-link" href="/products">
            View all buy-online products
          </Link>
        </div>
      )}
    </section>
  );
}
