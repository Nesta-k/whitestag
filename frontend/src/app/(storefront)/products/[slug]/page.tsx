import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AddToCartButton from "@/components/catalogue/add-to-cart-button";
import { getProduct } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/types/api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  try {
    const { slug } = await params;
    const product = await getProduct(slug);
    return {
      title: `${product.name} | WhiteStag`,
      description:
        product.description || `Explore ${product.name} in the WhiteStag catalogue.`,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return { title: "Product | WhiteStag" };
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let product: Product;

  try {
    product = await getProduct(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    const message =
      error instanceof ApiError
        ? `The catalogue service returned an error (${error.status}).`
        : error instanceof Error
          ? error.message
          : "Please try again shortly.";
    return (
      <section className="product-detail">
        <div className="catalogue-message" role="alert">
          <h1>Product unavailable</h1>
          <p>{message}</p>
          <Link className="text-link" href="/products">
            Return to the catalogue
          </Link>
        </div>
      </section>
    );
  }

  const purchasable =
    product.product_type === "spare_part" &&
    product.sales_method === "direct_purchase" &&
    product.price !== null &&
    Number(product.price) > 0 &&
    product.currency === "GHS";
  const images = product.images;

  return (
    <article className="product-detail">
      <Link className="back-link" href="/products">
        ← Back to catalogue
      </Link>
      <div className="product-detail-grid">
        <div className="product-gallery">
          {images.length > 0 ? (
            <div className="product-detail-image">
              <Image
                src={images[0].image_url}
                alt={images[0].alt_text || product.name}
                fill
                sizes="(max-width: 800px) 100vw, 55vw"
                priority
                unoptimized
              />
            </div>
          ) : (
            <div className="product-detail-placeholder" aria-hidden="true">
              WHITESTAG
            </div>
          )}
          {images.length > 1 && (
            <div className="product-thumbnails">
              {images.slice(1).map((image) => (
                <div className="product-thumbnail" key={image.image_url}>
                  <Image
                    src={image.image_url}
                    alt={image.alt_text || product.name}
                    fill
                    sizes="160px"
                    unoptimized
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="product-detail-copy">
          <p className="eyebrow">
            {product.brand?.name ?? product.category.name}
          </p>
          <h1>{product.name}</h1>
          <p className="product-sku">SKU {product.sku}</p>
          <p className="product-detail-price">
            {formatPrice(product.price, product.currency)}
          </p>
          {product.description ? (
            <p className="product-description">{product.description}</p>
          ) : (
            <p className="product-description">
              Contact our team for more information about this item.
            </p>
          )}
          {purchasable ? (
            <AddToCartButton productId={product.id} />
          ) : (
            <a
              className="primary-link"
              href={`mailto:hello@whitestag.com?subject=${encodeURIComponent(
                `Enquiry about ${product.name} (${product.sku})`,
              )}`}
            >
              Ask us about this item <span aria-hidden="true">↗</span>
            </a>
          )}
          {product.specifications.length > 0 && (
            <section className="specifications">
              <h2>Specifications</h2>
              <dl>
                {product.specifications.map((specification) => (
                  <div key={specification.name}>
                    <dt>{specification.name}</dt>
                    <dd>{specification.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
