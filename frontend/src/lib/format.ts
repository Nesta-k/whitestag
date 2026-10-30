export function formatPrice(amount: string | null, currency: string): string {
  if (amount === null) return "Price on request";

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "Price unavailable";

  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(numericAmount);
}
