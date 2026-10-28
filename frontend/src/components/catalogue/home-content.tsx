"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { getBrands, getCategories, getProducts } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";
import type { Brand, Category, Product, ProductType } from "@/types/api";
import { ProductCard } from "@/components/ui/product-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const categoryShortcuts: {
  label: string;
  description: string;
  productType: ProductType;
  icon: string;
  categoryMatch?: string[];
}[] = [
  { label: "Cars", description: "Browse cars in the catalogue", productType: "car", icon: "car" },
  { label: "EV Cars", description: "Explore electric vehicles", productType: "electric_vehicle", icon: "electric" },
  { label: "Tricycles", description: "Find a tricycle for your work", productType: "tricycle", icon: "tricycle" },
  { label: "Bikes", description: "Browse motorcycles and bikes", productType: "motorcycle_bike", icon: "bike" },
  { label: "Automobile Spare Parts", description: "Parts for everyday motoring", productType: "spare_part", icon: "parts", categoryMatch: ["automobile", "car parts"] },
  { label: "Tricycle Spare Parts", description: "Parts for tricycle maintenance", productType: "spare_part", icon: "tricycle-parts", categoryMatch: ["tricycle"] },
  { label: "EV Parts", description: "Parts for electric vehicles", productType: "spare_part", icon: "electric-parts", categoryMatch: ["electric", "ev"] },
];

function CategoryIcon({ name }: { name: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
    viewBox: "0 0 48 48",
    "aria-hidden": true as const,
  };

  if (name.includes("car")) {
    return <svg {...common}><path d="M8 28h32l-3-10a4 4 0 0 0-4-3H16a4 4 0 0 0-4 3l-4 10v9h5v-4h22v4h5v-9Z" /><path d="m13 27 3-8h16l3 8M14 30h.1m20 0h.1" /></svg>;
  }
  if (name.includes("electric")) {
    return <svg {...common}><path d="M8 28h32l-3-10a4 4 0 0 0-4-3H16a4 4 0 0 0-4 3l-4 10v9h5v-4h22v4h5v-9Z" /><path d="m26 17-6 10h5l-3 8 8-12h-5l3-6Z" /></svg>;
  }
  if (name.includes("tricycle")) {
    return <svg {...common}><circle cx="13" cy="34" r="5" /><circle cx="36" cy="34" r="5" /><path d="m13 34 8-14h11l4 14M21 20l-4-5h-5m13 5 4-6h7v10H22m-5 10h16" /><path d="M27 15h6" /></svg>;
  }
  if (name.includes("bike")) {
    return <svg {...common}><circle cx="12" cy="33" r="7" /><circle cx="36" cy="33" r="7" /><path d="m12 33 8-13 8 13H12Zm8-13h8l8 13M18 16h5m8 0h4" /></svg>;
  }
  return <svg {...common}><path d="M9 10h30v28H9zM15 10V7h18v3M15 17h18M15 23h18M15 29h10" /><path d="m30 30 4 4 7-8" /></svg>;
}

function compactErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The catalogue is temporarily unavailable.";
}

export function HomeContent() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setCatalogueError("");
    const [categoryResult, brandResult, productResult] = await Promise.allSettled([
      getCategories(),
      getBrands(),
      getProducts({
        product_type: "spare_part",
        sales_method: "direct_purchase",
      }),
    ]);

    if (categoryResult.status === "fulfilled") {
      setCategories(categoryResult.value.results);
    } else {
      setCategories([]);
      setCatalogueError(compactErrorMessage(categoryResult.reason));
    }

    if (brandResult.status === "fulfilled") {
      setBrands(brandResult.value.results.slice(0, 8));
    } else {
      setBrands([]);
    }

    if (productResult.status === "fulfilled") {
      setProducts(productResult.value.results.slice(0, 4));
    } else {
      setProducts([]);
      setCatalogueError(compactErrorMessage(productResult.reason));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <section className="home-hero">
        <div className="page-container home-hero-grid">
          <div className="home-hero-copy">
            <p className="home-hero-kicker"><span aria-hidden="true" /> WhiteStag automotive</p>
            <h1>Parts for the road ahead.</h1>
            <p className="home-hero-subtitle">Find the right parts. Keep your vehicle moving.</p>
            <p className="home-hero-description">
              Explore our live catalogue of automotive spares, or talk with our team about vehicles and tricycles.
            </p>
            <div className="home-hero-actions">
              <Button href="/products" variant="primary">Shop spare parts <span aria-hidden="true">→</span></Button>
              <Link href="/vehicles">Explore vehicles <span aria-hidden="true">→</span></Link>
            </div>
            <div className="home-hero-dots" aria-hidden="true">
              <span className="is-active" />
              <span />
              <span />
            </div>
          </div>
          <div className="home-hero-art" role="img" aria-label="WhiteStag automotive parts feature artwork">
            <Image
              className="hero-parts-photo"
              src="/spare-parts-hero.png"
              alt=""
              fill
              sizes="(max-width: 600px) 100vw, (max-width: 850px) 45vw, 35vw"
              priority
            />
            <div className="hero-art-disc" aria-hidden="true">
              <Image src="/whitestag%20logo.svg" alt="" width={119} height={74} />
            </div>
            <div className="hero-art-caption">Genuine parts<br /><small>Trusted quality</small></div>
          </div>
          <div className="home-hero-benefits" aria-label="WhiteStag service values">
            <div><span className="benefit-icon" aria-hidden="true">✓</span><span><strong>Genuine Parts</strong><small>Trusted Quality</small></span></div>
            <div><span className="benefit-icon" aria-hidden="true">↗</span><span><strong>Fast Delivery</strong><small>Across Ghana</small></span></div>
            <div><span className="benefit-icon" aria-hidden="true">?</span><span><strong>Expert Support</strong><small>Always Here</small></span></div>
          </div>
        </div>
      </section>

      <section id="categories" className="page-container home-categories" aria-labelledby="home-categories-title">
        <div className="home-section-heading home-categories-heading">
          <div><p className="eyebrow">Explore WhiteStag</p><h2 id="home-categories-title">Shop by category</h2></div>
          <Link className="text-link" href="/products">Browse all parts <span aria-hidden="true">→</span></Link>
        </div>
        <div className="home-category-grid">
          {categoryShortcuts.map((shortcut) => {
            const matchingCategory = shortcut.categoryMatch
              ? categories.find((category) =>
                  shortcut.categoryMatch?.some((term) =>
                    category.name.toLocaleLowerCase().includes(term),
                  ),
                )
              : undefined;
            const href = matchingCategory
              ? `/categories/${encodeURIComponent(matchingCategory.slug)}`
              : `/products?product_type=${encodeURIComponent(shortcut.productType)}`;
            return (
              <Link className="home-category-card" href={href} key={shortcut.label}>
                <span className="home-category-icon"><CategoryIcon name={shortcut.icon} /></span>
                <span className="home-category-card-copy">
                  <strong>{shortcut.label}</strong>
                  <small>{shortcut.description}</small>
                </span>
                <span className="home-category-arrow" aria-hidden="true">→</span>
              </Link>
            );
          })}
        </div>
        {catalogueError ? <p className="home-inline-note" role="status">{catalogueError} Category links remain available.</p> : null}
      </section>

      <section id="promotions" className="page-container home-promotions" aria-labelledby="home-promotions-title">
        <div className="home-section-heading">
          <div><p className="eyebrow">Offers from WhiteStag</p><h2 id="home-promotions-title">Featured Promotions</h2></div>
          <Link className="text-link" href="/promotions">View All Promotions <span aria-hidden="true">→</span></Link>
        </div>
        <div className="home-promotion-empty">
          <span className="promotion-empty-icon" aria-hidden="true">%</span>
          <div>
            <strong>No active promotions to show</strong>
            <p>When offers are published, they will appear here with current pricing and details.</p>
          </div>
        </div>
      </section>

      <section className="home-featured">
        <div className="page-container home-featured-inner">
          <div className="home-section-heading">
            <div><p className="eyebrow">Available from our catalogue</p><h2>Spare parts for every journey</h2></div>
            <Button href="/products" variant="outline">View all parts <span aria-hidden="true">→</span></Button>
          </div>
          {isLoading ? (
            <div className="product-grid">
              {Array.from({ length: 4 }, (_, index) => <Skeleton className="product-skeleton" key={index} />)}
            </div>
          ) : products.length > 0 ? (
            <div className="product-grid">
              {products.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <div className="home-product-empty">
              <EmptyState
                title={catalogueError ? "Catalogue temporarily unavailable" : "No published spare parts yet"}
                description={catalogueError || "Published, priced spare parts will appear here when available."}
              />
              {catalogueError ? <Button type="button" variant="outline" onClick={() => void load()}>Try again</Button> : null}
            </div>
          )}
        </div>
      </section>

      <section id="brands" className="page-container home-brands">
        <div className="home-section-heading">
          <div><p className="eyebrow">Discover the catalogue</p><h2>Browse by brand</h2></div>
          <Link className="text-link" href="/products">Explore all parts <span aria-hidden="true">→</span></Link>
        </div>
        {isLoading ? (
          <div className="brand-grid" aria-label="Loading brands">
            {Array.from({ length: 6 }, (_, index) => <Skeleton className="brand-skeleton" key={index} />)}
          </div>
        ) : brands.length ? (
          <div className="brand-grid">
            {brands.map((brand) => (
              <Link className="brand-tile" href={`/products?brand=${encodeURIComponent(brand.slug)}`} key={brand.id}>
                <span>{brand.name}</span><span aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="home-inline-note">Published brand information will appear here as it becomes available.</p>
        )}
      </section>

      <section id="preorders" className="page-container home-preorders">
        <div>
          <p className="eyebrow">Coming when available</p>
          <h2>Preorders</h2>
          <p>There are no preorder items published at this time.</p>
        </div>
        <span className="preorder-mark" aria-hidden="true">WS</span>
      </section>

      <section className="page-container vehicle-promo">
        <div>
          <p className="eyebrow">More than spare parts</p>
          <h2>Looking for a vehicle or tricycle?</h2>
          <p>Explore available catalogue listings or speak with our team about a quote.</p>
        </div>
        <Button href="/vehicles" variant="outline">Explore vehicles <span aria-hidden="true">→</span></Button>
      </section>

      <section id="how-it-works" className="how-it-works">
        <div className="page-container section-space">
          <div className="home-section-heading">
            <div><p className="eyebrow">Straightforward from start to finish</p><h2>How WhiteStag works</h2></div>
          </div>
          <div className="steps-grid">
            <article><span>01</span><h3>Find your part</h3><p>Browse the live catalogue by category and brand, then review the details.</p></article>
            <article><span>02</span><h3>Confirm your order</h3><p>Your cart and checkout are checked against current availability by our system.</p></article>
            <article><span>03</span><h3>Pay securely</h3><p>Complete payment through Paystack and follow your order from your account.</p></article>
          </div>
        </div>
      </section>

      <section id="support" className="page-container support-banner">
        <div>
          <p className="eyebrow eyebrow-light">Need a hand?</p>
          <h2>Not sure which part fits?</h2>
          <p>Browse product specifications, or ask our team about the right fit for your vehicle.</p>
        </div>
        {contactEmail
          ? <Button href={`mailto:${contactEmail}`} variant="light">Talk to our team <span aria-hidden="true">→</span></Button>
          : <p className="hero-contact-note">Sales contact details are being configured.</p>}
      </section>
    </>
  );
}
