interface SkeletonProps {
  className?: string;
  label?: string;
}

export function Skeleton({ className = "", label = "Loading" }: SkeletonProps) {
  return <div className={`skeleton ${className}`.trim()} role="status" aria-label={label} />;
}
