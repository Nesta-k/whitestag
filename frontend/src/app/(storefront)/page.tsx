import type { ReactNode } from "react";
import Link from "next/link";
import { getHomepage, getProducts } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";
import Hero from "@/components/home/hero";
import CategoryRail from "@/components/home/category-rail";
import PromoBanners from "@/components/home/promo-banners";
import TopProducts from "@/components/home/top-products";
import VehicleShowcase from "@/components/home/vehicle-showcase";
import {
  BrandStrip,
  HowItWorks,
  PreordersNotice,
  SupportSection,
} from "@/components/home/misc-sections";
import type { HomepageData, Product } from "@/types/api";

// The homepage is driven entirely by CMS-managed content, so it must render on
// demand rather than being prerendered at build time.
export const dynamic = "force-dynamic";

const VEHICLE_TYPES = [
  "car",
  "electric_vehicle",
  "tricycle",
  "motorcycle_bike",
] as const;

const DEFAULT_SECTION_ORDER = [
  "hero",
  "categories",
  "promotions",
  "featured_products",
  "brands",
  "preorders",
  "vehicles",
  "how_it_works",
  "support",
];

async function loadVehicleProducts(): Promise<Product[]> {
  const responses = await Promise.allSettled(
    VEHICLE_TYPES.map((productType) =>
      getProducts({
        product_type: productType,
        sales_method: "direct_purchase",
      }),
    ),
  );
  const seen = new Set<number>();
  const products: Product[] = [];
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const product of response.value.results) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      products.push(product);
    }
  }
  return products.slice(0, 8);
}

export default async function Home() {
  let homepage: HomepageData;
  let vehicleProducts: Product[] = [];

  try {
    const [homepageData, vehicles] = await Promise.all([
      getHomepage(),
      loadVehicleProducts(),
    ]);
    homepage = homepageData;
    vehicleProducts = vehicles;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `The catalogue service returned an error (${error.status}).`
        : error instanceof Error
          ? error.message
          : "Please try again shortly.";
    return (
      <section className="ws-home-error">
        <div className="catalogue-message" role="alert">
          <h1>We could not load the homepage</h1>
          <p>{message}</p>
          <p>Check that the Django API is running and reload the page.</p>
          <Link className="primary-link" href="/products">
            Open the catalogue <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    );
  }

  const { settings, featured_categories, featured_products, promotions, brands } =
    homepage;

  const configuredOrder = Array.isArray(settings.section_order)
    ? settings.section_order
    : [];
  const order = [
    ...configuredOrder,
    ...DEFAULT_SECTION_ORDER.filter((key) => !configuredOrder.includes(key)),
  ];

  const sections: Record<string, ReactNode> = {
    hero: settings.show_hero ? <Hero settings={settings} /> : null,
    categories: settings.show_categories ? (
      <CategoryRail settings={settings} categories={featured_categories} />
    ) : null,
    promotions: settings.show_promotions ? (
      <PromoBanners settings={settings} promotions={promotions} />
    ) : null,
    featured_products: settings.show_featured_products ? (
      <TopProducts
        settings={settings}
        initialProducts={featured_products.filter(
          (product) => product.sales_method === "direct_purchase",
        )}
        categories={featured_categories}
      />
    ) : null,
    brands: settings.show_brands ? (
      <BrandStrip settings={settings} brands={brands} />
    ) : null,
    preorders: settings.show_preorders ? (
      <PreordersNotice settings={settings} />
    ) : null,
    vehicles: settings.show_vehicles ? (
      <VehicleShowcase settings={settings} products={vehicleProducts} />
    ) : null,
    how_it_works: settings.show_how_it_works ? (
      <HowItWorks settings={settings} />
    ) : null,
    support: settings.show_support ? <SupportSection settings={settings} /> : null,
  };

  const rendered = order.filter((key) => key in sections);

  return (
    <div className="ws-home">
      {rendered.map((key) => (
        <div className="ws-home-section" key={key}>
          {sections[key]}
        </div>
      ))}
    </div>
  );
}
