"use client";

import Link from "next/link";
import ProductCard from "@/components/catalogue/product-card";
import { useAuth } from "@/store/auth-context";
import { useWishlist } from "@/store/wishlist-context";

export default function WishlistPage() {
  const { user, loading: authLoading } = useAuth();
  const { items, loading, error } = useWishlist();

  return (
    <section className="catalogue-page">
      <div className="catalogue-heading">
        <p className="eyebrow">YOUR WISHLIST</p>
        <h1>Saved for later.</h1>
        <p>Items you save are stored against your WhiteStag account.</p>
      </div>

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
      ) : items.length === 0 ? (
        <div className="catalogue-message">
          <h2>Your wishlist is empty</h2>
          <p>Browse the catalogue and save the parts and vehicles you want to revisit.</p>
          <Link className="text-link" href="/products">
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <>
          <p className="catalogue-count">
            {items.length} {items.length === 1 ? "item" : "items"} saved
          </p>
          <div className="product-grid">
            {items.map((item) => (
              <ProductCard key={item.id} product={item.product} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
