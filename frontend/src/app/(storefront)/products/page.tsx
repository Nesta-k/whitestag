import type { Metadata } from "next";
import CatalogueListing from "@/components/catalogue/catalogue-listing";

export const metadata: Metadata = {
  title: "Shop parts and products | WhiteStag",
  description: "Browse products available for direct purchase from WhiteStag.",
};

type SearchParams = {
  search?: string;
  category?: string;
  brand?: string;
  product_type?: string;
  page?: string;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <CatalogueListing
      filters={await searchParams}
      salesMethod="direct_purchase"
    />
  );
}
