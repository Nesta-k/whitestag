import type { SalesMode } from "@/lib/types";

export const formatPrice = (price: number) => new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 0,
}).format(price);

export const salesModeLabel: Record<SalesMode, string> = {
    buy_now: "Buy Now",
    quote: "Request a Quote",
    preorder: "Preorder",
};