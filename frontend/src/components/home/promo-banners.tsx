import Image from "next/image";
import Link from "next/link";
import type { HomepageSettings, Promotion } from "@/types/api";

function safeHref(href: string): string | null {
  if (!href) return null;
  if (href.startsWith("/")) return href;
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") return href;
  } catch {
    return null;
  }
  return null;
}

export default function PromoBanners({
  settings,
  promotions,
}: {
  settings: HomepageSettings;
  promotions: Promotion[];
}) {
  // No active promotions: hide the section rather than showing fake offers.
  if (promotions.length === 0) return null;

  return (
    <section className="ws-section ws-promotions" id="promotions">
      <div className="ws-section-head">
        <p className="eyebrow">{settings.promotions_eyebrow}</p>
        <h2>{settings.promotions_heading}</h2>
      </div>

      <div className="ws-promo-grid">
        {promotions.map((promotion) => {
          const href = safeHref(promotion.cta_href);
          return (
            <article className="ws-promo-card" key={promotion.id}>
              <div className="ws-promo-media">
                {promotion.image_url ? (
                  <Image
                    src={promotion.image_url}
                    alt={promotion.image_alt || promotion.title}
                    fill
                    sizes="(max-width: 800px) 100vw, 50vw"
                    unoptimized
                  />
                ) : (
                  <span className="ws-promo-placeholder" aria-hidden="true">
                    WHITESTAG
                  </span>
                )}
              </div>
              <div className="ws-promo-copy">
                <h3>{promotion.title}</h3>
                {promotion.description && <p>{promotion.description}</p>}
                {promotion.cta_label && href && (
                  <Link className="ws-btn ws-btn-primary ws-btn-sm" href={href}>
                    {promotion.cta_label}
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
