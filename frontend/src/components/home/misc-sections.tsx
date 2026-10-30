import Image from "next/image";
import Link from "next/link";
import type { Brand, HomepageSettings } from "@/types/api";

export function BrandStrip({
  settings,
  brands,
}: {
  settings: HomepageSettings;
  brands: Brand[];
}) {
  if (brands.length === 0) return null;

  return (
    <section className="ws-section ws-brands" id="brands">
      <div className="ws-section-head">
        <p className="eyebrow">{settings.brands_eyebrow}</p>
        <h2>{settings.brands_heading}</h2>
      </div>

      <ul className="ws-brand-strip">
        {brands.map((brand) => (
          <li key={brand.id}>
            <Link
              className="ws-brand"
              href={`/products?brand=${encodeURIComponent(brand.slug)}`}
            >
              <span className="ws-brand-media">
                {brand.logo_url ? (
                  <Image
                    src={brand.logo_url}
                    alt={brand.name}
                    fill
                    sizes="140px"
                    unoptimized
                  />
                ) : (
                  <span className="ws-brand-name">{brand.name}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const steps = [
  {
    title: "Browse the live catalogue",
    description:
      "Every listing, price, and specification comes straight from the WhiteStag catalogue.",
  },
  {
    title: "Buy online or request a quote",
    description:
      "Add spare parts to your cart, or ask our team about vehicles and quote-based items.",
  },
  {
    title: "Check out with confidence",
    description:
      "Choose your delivery zone at checkout and pay securely through Paystack.",
  },
];

export function HowItWorks({ settings }: { settings: HomepageSettings }) {
  return (
    <section className="ws-section ws-how" id="how-it-works">
      <div className="ws-section-head">
        <p className="eyebrow">{settings.how_it_works_eyebrow}</p>
        <h2>{settings.how_it_works_heading}</h2>
      </div>

      <ol className="ws-steps">
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="ws-step-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SupportSection({ settings }: { settings: HomepageSettings }) {
  return (
    <section className="ws-support" id="support">
      <div className="ws-support-inner">
        <div>
          <p className="eyebrow">{settings.support_eyebrow}</p>
          <h2>{settings.support_heading}</h2>
          {settings.support_body && <p>{settings.support_body}</p>}
        </div>
        <div className="ws-support-actions">
          <Link className="ws-btn ws-btn-primary" href="/products">
            Browse the catalogue
          </Link>
          <Link className="ws-btn ws-btn-outline" href="/vehicles">
            Explore vehicles
          </Link>
        </div>
      </div>
    </section>
  );
}

export function PreordersNotice({ settings }: { settings: HomepageSettings }) {
  return (
    <section className="ws-section ws-preorders" id="preorders">
      <div className="ws-notice">
        <p className="eyebrow">{settings.preorders_eyebrow}</p>
        <h2>{settings.preorders_heading}</h2>
        <p>{settings.preorders_body}</p>
      </div>
    </section>
  );
}
