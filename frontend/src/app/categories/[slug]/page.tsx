import { ProductListing } from "@/components/catalogue/product-listing";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProductListing categorySlug={slug} />;
}
