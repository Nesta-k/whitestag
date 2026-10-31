import type { Metadata } from "next";
import CatalogueListing from "@/components/catalogue/catalogue-listing";

export const metadata: Metadata = {
  title: "Request a quote | WhiteStag",
  description:
    "Browse vehicles and specialist products available by quotation from WhiteStag.",
};

type SearchParams = {
  search?: string;
  category?: string;
  brand?: string;
  product_type?: string;
  page?: string;
};

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <CatalogueListing filters={await searchParams} salesMethod="quotation" />
  );
}
