import Link from "next/link";
import { notFound } from "next/navigation";
import ProductEnquiryForm from "@/components/catalogue/product-enquiry-form";
import { getProduct } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";

export default async function ProductEnquiryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const product = await getProduct(slug);
    return (
      <ProductEnquiryForm
        product={{
          id: product.id,
          name: product.name,
          sku: product.sku,
          slug: product.slug,
        }}
      />
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();

    const errorMessage =
      error instanceof ApiError
        ? `The catalogue service returned an error (${error.status}).`
        : error instanceof Error
          ? error.message
          : "Please try again shortly.";

    return (
      <section className="account-page">
        <p className="eyebrow">PRODUCT ENQUIRY</p>
        <h1>Enquiry unavailable.</h1>
        <p className="account-intro" role="alert">
          {errorMessage}
        </p>
        <Link className="primary-link" href="/products">
          Return to the catalogue
        </Link>
      </section>
    );
  }
}
