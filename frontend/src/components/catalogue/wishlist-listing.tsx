"use client";

import Link from "next/link";
import ProductCard from "@/components/catalogue/product-card";
import { useAuth } from "@/store/auth-context";
import { useWishlist } from "@/store/wishlist-context";

export default function WishlistListing({
  salesMethod,
}: {
  salesMethod: "direct_purchase" | "quotation";
}) {
  const { user, loading: authLoading } = useAuth();
  const { items, loading, error } = useWishlist();
  const isQuoteWishlist = salesMethod === "quotation";
  const visibleItems = items.filter(
    (item) => item.product.sales_method === salesMethod,
  );

  return (
    <section className="catalogue-page">
      <div className="catalogue-heading">
        <p className="eyebrow">YOUR WISHLIST</p>
        <h1>{isQuoteWishlist ? "Saved to ask about." : "Saved for later."}</h1>
        <p>Items you save are stored against your WhiteStag account.</p>
      </div>

      <nav className="catalogue-mode-switch" aria-label="Choose wishlist">
        <Link
          className={!isQuoteWishlist ? "is-active" : ""}
          href="/wishlist"
          aria-current={!isQuoteWishlist ? "page" : undefined}
        >
          Buy online
        </Link>
        <Link
          className={isQuoteWishlist ? "is-active" : ""}
          href="/wishlist/quotes"
          aria-current={isQuoteWishlist ? "page" : undefined}
        >
          Request a quote
        </Link>
      </nav>

      {authLoading ? (
        <p className="catalogue-count">Checking your account…</p>
      ) : !user ? (
        <div className="catalogue-message">
          <h2>Sign in to view your wishlist</h2>
          <p>Your saved items follow your WhiteStag account.</p>
          <Link className="primary-link" href="/account">
            Sign in <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : error ? (
        <div className="catalogue-message" role="alert">
          <h2>Wishlist unavailable</h2>
          <p>{error}</p>
        </div>
      ) : loading ? (
        <p className="catalogue-count">Loading your wishlist…</p>
      ) : visibleItems.length === 0 ? (
        <div className="catalogue-message">
          <h2>
            {items.length === 0
              ? "Your wishlist is empty"
              : `No ${isQuoteWishlist ? "quote-request" : "buy-online"} items saved`}
          </h2>
          <p>
            {items.length === 0
              ? "Browse the catalogue and save items you want to revisit."
              : "Saved items for the other buying option are in its separate wishlist."}
          </p>
          <Link className="text-link" href={isQuoteWishlist ? "/quotes" : "/products"}>
            {isQuoteWishlist ? "Browse quote-request items" : "Browse buy-online items"}
          </Link>
        </div>
      ) : (
        <>
          <p className="catalogue-count">
            {visibleItems.length}{" "}
            {visibleItems.length === 1 ? "item" : "items"} saved
          </p>
          <div className="product-grid">
            {visibleItems.map((item) => (
              <ProductCard key={item.id} product={item.product} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
