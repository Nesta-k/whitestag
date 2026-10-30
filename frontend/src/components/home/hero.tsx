import Image from "next/image";
import Link from "next/link";
import type { HomepageSettings } from "@/types/api";

export default function Hero({ settings }: { settings: HomepageSettings }) {
  const primaryHref = settings.hero_primary_cta_href || "/products";
  const secondaryHref = settings.hero_secondary_cta_href || "/vehicles";

  return (
    <section className="ws-hero">
      {settings.hero_image_url ? (
        <div className="ws-hero-media">
          <Image
            src={settings.hero_image_url}
            alt={settings.hero_image_alt || settings.hero_heading}
            fill
            priority
            sizes="100vw"
            unoptimized
          />
        </div>
      ) : (
        <div className="ws-hero-media ws-hero-media-fallback" aria-hidden="true" />
      )}
      <div className="ws-hero-scrim" aria-hidden="true" />

      <div className="ws-hero-inner">
        {settings.hero_kicker && (
          <p className="ws-hero-kicker">{settings.hero_kicker}</p>
        )}
        <h1 className="ws-hero-title">{settings.hero_heading}</h1>
        {settings.hero_subtitle && (
          <p className="ws-hero-subtitle">{settings.hero_subtitle}</p>
        )}
        {settings.hero_description && (
          <p className="ws-hero-description">{settings.hero_description}</p>
        )}
        <div className="ws-hero-actions">
          {settings.hero_primary_cta_label && (
            <Link className="ws-btn ws-btn-primary" href={primaryHref}>
              {settings.hero_primary_cta_label}
            </Link>
          )}
          {settings.hero_secondary_cta_label && (
            <Link className="ws-btn ws-btn-outline" href={secondaryHref}>
              {settings.hero_secondary_cta_label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
