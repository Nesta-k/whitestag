"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCategories } from "@/lib/api/catalogue";
import { useAuth } from "@/store/auth-context";
import { useCart } from "@/store/cart-context";
import type { Category } from "@/types/api";

const primaryLinks = [
  { href: "/", label: "Home" },
  { href: "/vehicles", label: "Vehicles" },
  { href: "/products", label: "Spare Parts" },
  { href: "/#brands", label: "Brands" },
  { href: "/promotions", label: "Promotions" },
  { href: "/#preorders", label: "Preorders" },
  { href: "/#how-it-works", label: "About Us" },
  { href: "/#support", label: "Contact" },
];

export function Header() {
  const { customer, signOut } = useAuth();
  const { cart } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const cartCount = cart?.item_count ?? 0;

  useEffect(() => {
    let active = true;
    getCategories()
      .then((response) => {
        if (active) setCategories(response.results);
      })
      .catch(() => {
        if (active) setCategories([]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSignOut() {
    setSignOutError("");
    try {
      await signOut();
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Sign-out could not be confirmed by the server.");
    }
  }

  return (
    <header className="site-header">
      <div className="header-main page-container">
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
          <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
        </button>
        <Link className="brand-lockup" href="/" aria-label="WhiteStag home">
          <Image
            className="brand-logo"
            src="/whitestag%20logo.svg"
            alt=""
            width={119}
            height={74}
            priority
          />
          <span className="header-brand-copy">
            <strong>WhiteStag</strong>
            <small>DRIVE · MOVE · GROW</small>
          </span>
        </Link>
        <form className="header-search" action="/products" method="get" role="search">
          <label className="sr-only" htmlFor="header-search-field">Search the WhiteStag catalogue</label>
          <input
            id="header-search-field"
            name="search"
            type="search"
            placeholder="Search for parts, vehicles, brands..."
            autoComplete="off"
          />
          <button type="submit" aria-label="Search catalogue">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 4.5 4.5" />
            </svg>
          </button>
        </form>
        <div className="header-actions">
          <Link className="header-account" href="/account">
            <span className="header-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-3.4 3.1-5.2 7-5.2s6.3 1.8 7 5.2" /></svg>
            </span>
            <span>{customer ? "My account" : "Account"}</span>
          </Link>
          <button
            className="header-wishlist"
            type="button"
            disabled
            aria-label="Wishlist unavailable"
            title="Wishlist is not available yet"
          >
            <span className="header-action-icon" aria-hidden="true">♡</span>
            <span>Wishlist</span>
          </button>
          <Link className="cart-link" href="/cart" aria-label={`Cart, ${cartCount} items`}>
            <span className="header-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M3 4h2l2.2 11.1a2 2 0 0 0 2 1.6h8.5a2 2 0 0 0 1.9-1.5L21 8H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>
            </span>
            <span>Cart</span>
            <span className="cart-count" aria-label={`${cartCount} items`}>{cartCount}</span>
          </Link>
          {customer ? (
            <button type="button" className="signout-link" onClick={handleSignOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </div>
      <div className={`header-navigation-bar ${menuOpen ? "is-open" : ""}`}>
        <div className="header-navigation-inner page-container">
          <details className="all-categories-menu">
            <summary>
              <span aria-hidden="true">☰</span>
              <span>All Categories</span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="all-categories-dropdown">
              <Link href="/products">Browse all parts</Link>
              {categories.map((category) => (
                <Link
                  href={`/categories/${encodeURIComponent(category.slug)}`}
                  key={category.id}
                >
                  {category.name}
                </Link>
              ))}
              {categories.length === 0 ? (
                <span className="category-menu-note">Catalogue categories will appear here when available.</span>
              ) : null}
            </div>
          </details>
          <nav
            id="primary-navigation"
            className={`primary-navigation ${menuOpen ? "is-open" : ""}`}
            aria-label="Main navigation"
          >
            {primaryLinks.map((link) => (
              <Link key={link.label} href={link.href} onClick={() => setMenuOpen(false)}>
                {link.label}
              </Link>
            ))}
          </nav>
          <Link className="header-location" href="/vehicles">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.2" /></svg>
            <span>Showroom</span>
          </Link>
        </div>
      </div>
      {signOutError ? <p className="header-feedback page-container" role="status">{signOutError}</p> : null}
    </header>
  );
}
