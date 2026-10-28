import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function PromotionsPage() {
  return (
    <div className="promotions-page">
      <section className="promotions-hero">
        <div className="page-container">
          <p className="eyebrow eyebrow-light">WhiteStag offers</p>
          <h1>Good parts. Clear value.</h1>
          <p>When WhiteStag publishes an offer, it will appear here with its current terms and availability.</p>
          <Button href="/products" variant="light">Browse the live catalogue</Button>
        </div>
      </section>
      <section className="page-container section-space">
        <div className="promotions-empty">
          <p className="eyebrow">Current offers</p>
          <EmptyState
            title="No active promotions"
            description="The current backend does not provide promotion data, so no offers or discounted prices are shown."
            action={<Link className="text-link" href="/products">Shop published products <span aria-hidden="true">→</span></Link>}
          />
        </div>
      </section>
    </div>
  );
}
