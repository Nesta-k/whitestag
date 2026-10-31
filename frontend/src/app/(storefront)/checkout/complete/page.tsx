import PaymentReturn from "@/components/checkout/payment-return";

export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  return (
    <PaymentReturn reference={params.reference ?? params.trxref ?? ""} />
  );
}
