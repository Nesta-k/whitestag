"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getAllProducts } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";
import type { Product } from "@/types/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

const vehicleTypes = ["car", "electric_vehicle", "tricycle"] as const;

export default function VehiclesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadVehicles = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const responses = await Promise.all(
        vehicleTypes.map((productType) => getAllProducts({ product_type: productType })),
      );
      setProducts(responses.flat());
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Vehicle and tricycle listings could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const salesEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

  return (
    <div className="vehicles-page">
      <section className="vehicles-hero">
        <div className="page-container">
          <p className="eyebrow eyebrow-light">WhiteStag showroom</p>
          <h1>Vehicles and tricycles, by enquiry.</h1>
          <p>Explore published listings and speak with WhiteStag about availability, specifications and a tailored quote.</p>
          {salesEmail ? (
            <Button href={`mailto:${salesEmail}?subject=${encodeURIComponent("WhiteStag vehicle enquiry")}`} variant="light">Request a quote</Button>
          ) : (
            <Button type="button" variant="light" disabled>Request a quote</Button>
          )}
          {!salesEmail ? <small>Sales contact details are not configured yet.</small> : null}
        </div>
      </section>

      <section className="page-container section-space">
        <div className="section-heading">
          <div><p className="eyebrow">Showroom listings</p><h2>Find your next vehicle</h2></div>
          <p className="catalogue-note">Vehicles and tricycles use the quote process, not the spare-parts cart.</p>
        </div>
        {error ? <ErrorState message={error} onRetry={() => void loadVehicles()} /> : null}
        {isLoading ? (
          <div className="vehicle-grid">
            {Array.from({ length: 3 }, (_, index) => <Skeleton className="vehicle-skeleton" key={index} />)}
          </div>
        ) : null}
        {!isLoading && !error && products.length === 0 ? (
          <EmptyState
            title="No published vehicle listings yet"
            description="There are currently no vehicles or tricycles available in the published catalogue. Check back or contact the WhiteStag sales team."
          />
        ) : null}
        {!isLoading && !error && products.length > 0 ? (
          <div className="vehicle-grid">
            {products.map((product) => {
              const image = product.images.find((item) => item.is_primary) ?? product.images[0];
              return (
                <article className="vehicle-card" key={product.id}>
                  <Link className="vehicle-image" href={`/products/${encodeURIComponent(product.slug)}`} aria-label={`View ${product.name}`}>
                    {image
                      ? <span role="img" aria-label={image.alt_text || product.name} style={{ backgroundImage: `url("${image.image_url}")` }} />
                      : <span className="product-image-placeholder" aria-hidden="true">WS</span>}
                  </Link>
                  <div className="vehicle-card-body">
                    <p className="eyebrow">{product.product_type.replaceAll("_", " ")}</p>
                    <h3><Link href={`/products/${encodeURIComponent(product.slug)}`}>{product.name}</Link></h3>
                    {product.brand ? <p>{product.brand.name}</p> : null}
                    {product.description ? <p className="vehicle-description">{product.description}</p> : null}
                    <div className="vehicle-card-actions">
                      <Button href={`/products/${encodeURIComponent(product.slug)}`} variant="outline">View details</Button>
                      {salesEmail ? (
                        <Button href={`mailto:${salesEmail}?subject=${encodeURIComponent(`Quote enquiry: ${product.name}`)}`} variant="primary">Request a quote</Button>
                      ) : null}
                    </div>
                    {product.specifications.length ? (
                      <dl className="vehicle-specifications">
                        {product.specifications.slice(0, 3).map((specification) => (
                          <div key={specification.name}><dt>{specification.name}</dt><dd>{specification.value}</dd></div>
                        ))}
                      </dl>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
        {!salesEmail ? (
          <p className="contact-configuration-note">
            To enable direct quote requests, configure the public sales contact in <code>NEXT_PUBLIC_CONTACT_EMAIL</code>.
          </p>
        ) : null}
      </section>
    </div>
  );
}
