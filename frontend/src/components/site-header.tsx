"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search, ShoppingBag, X } from "lucide-react";
import { useApp } from "@/components/app-provider";

export function SiteHeader() {
    const { cart } = useApp();
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    function search(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        router.push(`/catalog${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
        setMenuOpen(false);
        setSearchOpen(false);
    }

    return (
        <header className="site-header">
            <div className="site-header-inner">
                <Link href="/" className="brand-mark" aria-label="WhiteStag Automotive home">
                    <span className="brand-symbol">W</span><span className="brand-name">WhiteStag<span> AUTOMOTIVE</span></span>
                </Link>
                <nav className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
                    <Link href="/catalog" onClick={() => setMenuOpen(false)}>Inventory</Link>
                    <Link href="/#categories" onClick={() => setMenuOpen(false)}>Categories</Link>
                    <Link href="/about" onClick={() => setMenuOpen(false)}>About WhiteStag</Link>
                    <Link href="/visit" onClick={() => setMenuOpen(false)}>Showroom visit</Link>
                    <Link href="/admin" className="mobile-owner-link" onClick={() => setMenuOpen(false)}>Owner dashboard</Link>
                </nav>
                <form className={`header-search ${searchOpen ? "is-open" : ""}`} onSubmit={search} role="search">
                    <Search className="desktop-search-icon" size={16} aria-hidden="true" />
                    <input aria-label="Search inventory" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search inventory" />
                    <button type="submit" aria-label="Submit search"><span>Enter</span></button>
                </form>
                <div className="header-actions">
                    <button type="button" className="mobile-search-toggle" aria-label={searchOpen ? "Close search" : "Open search"} aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}><Search size={18} /></button>
                    <Link href="/cart" className="cart-link" aria-label={`Shopping cart, ${itemCount} items`}>
                        <ShoppingBag size={18} /><span>Cart</span>{itemCount > 0 && <b>{itemCount}</b>}
                    </Link>
                    <Link href="/admin" className="owner-link">Owner dashboard <span>↗</span></Link>
                    <button type="button" className="mobile-menu-button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
                        {menuOpen ? <X size={21} /> : <Menu size={21} />}
                    </button>
                </div>
            </div>
        </header>
    );
}