import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getPromotions } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";

export const metadata: Metadata = {
  title: "Offers | WhiteStag",
  description: "See current WhiteStag promotions and special offers.",
};

function safePromotionHref(href: string): string {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const parsedUrl = new URL(href);
    if (parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:") {
      return parsedUrl.toString();
    }
  } catch {
    return "/products";
  }
  return "/products";
}

export default async function PromotionsPage() {
  let promotions;
  let errorMessage = "";

  try {
    promotions = await getPromotions();
  } catch (error) {
    errorMessage =
      error instanceof ApiError
        ? `The offers service returned an error (${error.status}).`
        : error instanceof Error
          ? `We could not reach the offers service: ${error.message}`
          : "We could not load offers. Please try again shortly.";
  }

  return (
    <section className="catalogue-page">
      <div className="catalogue-heading">
        <p className="eyebrow">CURRENTLY AT WHITESTAG</p>
        <h1>Offers worth a look.</h1>
        <p>Discover current promotions from the WhiteStag team.</p>
      </div>
      {errorMessage ? (
        <div className="catalogue-message" role="alert">
          <h2>Offers unavailable</h2>
          <p>{errorMessage}</p>
        </div>
      ) : promotions?.results.length ? (
        <div className="promotion-grid">
          {promotions.results.map((promotion) => (
            <article className="promotion-card" key={promotion.id}>
              {promotion.image_url ? (
                <div className="promotion-image">
                  <Image
                    src={promotion.image_url}
                    alt={promotion.image_alt || promotion.title}
                    fill
                    sizes="(max-width: 700px) 100vw, 50vw"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="promotion-image promotion-placeholder" aria-hidden="true">
                  WS
                </div>
              )}
              <div className="promotion-copy">
                <h2>{promotion.title}</h2>
                <p>{promotion.description}</p>
                <Link
                  className="text-link"
                  href={safePromotionHref(promotion.cta_href)}
                  rel={
                    promotion.cta_href.startsWith("http")
                      ? "noopener noreferrer"
                      : undefined
                  }
                  target={
                    promotion.cta_href.startsWith("http") ? "_blank" : undefined
                  }
                >
                  {promotion.cta_label} <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="catalogue-message">
          <h2>No current offers</h2>
          <p>There are no active promotions right now. Please check back soon.</p>
        </div>
      )}
    </section>
  );
}
