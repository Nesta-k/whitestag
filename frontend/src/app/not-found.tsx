import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-container section-space">
      <div className="empty-state">
        <span className="empty-state-mark" aria-hidden="true">404</span>
        <h1>We couldn&apos;t find that page</h1>
        <p>It may have moved, or the link may be out of date.</p>
        <Link className="text-link" href="/">Return to WhiteStag home</Link>
      </div>
    </div>
  );
}
