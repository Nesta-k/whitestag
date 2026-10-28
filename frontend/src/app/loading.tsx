import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="page-container section-space" aria-label="Loading WhiteStag">
      <Skeleton className="orders-skeleton" />
    </div>
  );
}
