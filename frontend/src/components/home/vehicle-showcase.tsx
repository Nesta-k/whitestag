import Link from "next/link";
import ProductCard from "@/components/catalogue/product-card";
import type { HomepageSettings, Product } from "@/types/api";

export default function VehicleShowcase({
  settings,
  products,
}: {
  settings: HomepageSettings;
  products: Product[];
}) {
  if (products.length === 0) return null;

  return (
    <section className="ws-section ws-vehicles" id="vehicles">
      <div className="ws-section-head ws-section-head-row">
        <div>
          <p className="eyebrow">{settings.vehicles_eyebrow}</p>
          <h2>{settings.vehicles_heading}</h2>
          {settings.vehicles_body && (
            <p className="ws-section-body">{settings.vehicles_body}</p>
          )}
        </div>
        <Link className="ws-btn ws-btn-outline" href="/vehicles">
          Browse all vehicles
        </Link>
      </div>

      <div className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
