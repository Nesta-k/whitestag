export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function ProductCardSkeleton() {
  return (
    <div className="product-card product-card--skeleton">
      <Skeleton className="product-card-image-wrap" />
      <div className="product-card-body">
        <Skeleton className="sk-line sk-line--sm" />
        <Skeleton className="sk-line" />
        <Skeleton className="sk-line sk-line--sm" />
        <Skeleton className="sk-line sk-line--price" />
      </div>
    </div>
  );
}

