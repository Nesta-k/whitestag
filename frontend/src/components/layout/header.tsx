"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCategories } from "@/lib/api/catalogue";
import type { Category } from "@/types/api";
import { useAuth } from "@/store/auth-context";
import { useCart } from "@/store/cart-context";
import { useWishlist } from "@/store/wishlist-context";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Shop" },
  { href: "/vehicles", label: "Vehicles" },
  { href: "/promotions", label: "Promotions" },
  { href: "/#how-it-works", label: "About Us" },
  { href: "/#support", label: "Contact" },
];

function userInitials(firstName: string, lastName: string, email: string): string {
  const nameParts = `${firstName} ${lastName}`.trim().split(/\s+/).filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase();
  }

  const emailName = email.split("@", 1)[0] ?? "";
  const emailParts = emailName.split(/[._+-]+/).filter(Boolean);
  if (emailParts.length > 1) {
    return emailParts
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase();
  }
  return emailName.slice(0, 2).toUpperCase() || "U";
}

export default function Header() {
  const { user } = useAuth();
  const { itemCount } = useCart();
  const { count: wishlistCount } = useWishlist();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

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

  return (
    <>
      <header className="ws-header">
        <div className="ws-topbar">
          <div className="ws-topbar-inner">
            <Link className="ws-topbar-note" href="/#support">
              Customer support &amp; fitment advice — talk to our team
            </Link>
            <span className="ws-topbar-currency">Prices in Ghana Cedis (GHS)</span>
          </div>
        </div>

        <div className="ws-mainbar">
          <div className="ws-mainbar-inner">
            <Link aria-label="WhiteStag home" className="ws-logo" href="/">
              <Image
                alt=""
                className="ws-logo-mark"
                height={74}
                priority
                src="/logo.svg"
                unoptimized
                width={119}
              />
              <span className="ws-logo-text">
                <strong>WHITESTAG</strong>
                <small>Parts &amp; vehicles</small>
              </span>
            </Link>

            <form className="ws-search" action="/products" method="get" role="search">
              <label className="sr-only" htmlFor="ws-search-input">
                Search the catalogue
              </label>
              <input
                id="ws-search-input"
                type="search"
                name="search"
                placeholder="Search parts, vehicles, or brands…"
                autoComplete="off"
              />
              <button type="submit" aria-label="Search the catalogue">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
                  <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M16.5 16.5 21 21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </form>

            <div className="ws-actions">
              <Link className="ws-action ws-wishlist-action" href="/wishlist" aria-label={`Wishlist (${wishlistCount} items)`}>
                <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
                  <path
                    d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 7.8a4.2 4.2 0 0 1 7 2.9C19 15.6 12 20 12 20Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="ws-action-label">Wishlist</span>
                {wishlistCount > 0 && <span className="ws-badge">{wishlistCount}</span>}
              </Link>

              {user ? (
                <Link
                  className="ws-action ws-account-action"
                  href="/account"
                  aria-label={`Your account (${user.email})`}
                >
                  <span className="ws-account-initials" aria-hidden="true">
                    {userInitials(user.first_name, user.last_name, user.email)}
                  </span>
                </Link>
              ) : (
                <Link className="ws-action ws-account-action" href="/account" aria-label="Sign in">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
                    <circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M5 19.5a7 7 0 0 1 14 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <span className="ws-action-label">Sign in</span>
                </Link>
              )}

              <Link className="ws-action ws-cart" href="/cart" aria-label={`Cart (${itemCount} items)`}>
                <span className="ws-cart-icon">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
                    <path
                      d="M4 6h2.2l2 10.2h9.4L19.5 9H7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="10" cy="19.6" r="1.3" fill="currentColor" />
                    <circle cx="17" cy="19.6" r="1.3" fill="currentColor" />
                  </svg>
                  {itemCount > 0 && <span className="ws-badge">{itemCount}</span>}
                </span>
                <span className="ws-cart-copy">
                  <small>Cart</small>
                </span>
              </Link>
            </div>

            <button
              className="ws-menu-toggle"
              type="button"
              aria-expanded={menuOpen}
              aria-controls="ws-mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
                <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
              <span className="sr-only">{menuOpen ? "Close menu" : "Menu"}</span>
            </button>
          </div>
        </div>
      </header>

      <nav className="ws-nav" aria-label="Main navigation">
        <div className="ws-nav-inner">
          <div
            className="ws-categories"
            onMouseLeave={() => setCategoriesOpen(false)}
          >
            <button
              className="ws-categories-trigger"
              type="button"
              aria-expanded={categoriesOpen}
              onClick={() => setCategoriesOpen((open) => !open)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
                <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
              All Categories
            </button>
            {categoriesOpen && categories.length > 0 && (
              <ul className="ws-categories-menu">
                {categories.map((category) => (
                  <li key={category.id}>
                    <Link href={`/products?category=${encodeURIComponent(category.slug)}`}>
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ul className="ws-nav-links">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>

          <p className="ws-nav-note">WhiteStag automotive parts &amp; vehicles</p>
        </div>
      </nav>

      {menuOpen && (
        <div className="ws-mobile-menu" id="ws-mobile-menu">
          <ul>
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} onClick={() => setMenuOpen(false)}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="ws-mobile-heading">Your account</p>
          <ul className="ws-mobile-account">
            <li>
              <Link href="/wishlist" onClick={() => setMenuOpen(false)}>
                Wishlist{wishlistCount > 0 ? ` (${wishlistCount})` : ""}
              </Link>
            </li>
            <li>
              <Link href="/account" onClick={() => setMenuOpen(false)}>
                {user ? "Account" : "Sign in"}
              </Link>
            </li>
          </ul>
          {categories.length > 0 && (
            <>
              <p className="ws-mobile-heading">All categories</p>
              <ul className="ws-mobile-categories">
                {categories.map((category) => (
                  <li key={category.id}>
                    <Link
                      href={`/products?category=${encodeURIComponent(category.slug)}`}
                      onClick={() => setMenuOpen(false)}
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}
