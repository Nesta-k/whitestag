import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: BadgeTone;
}) {
  return <span className={`ws-dash-badge is-${tone}`}>{label}</span>;
}

const ORDER_STATUS_TONES: Record<string, BadgeTone> = {
  pending: "warning",
  processing: "info",
  completed: "success",
  cancelled: "danger",
  expired: "neutral",
};

const PAYMENT_STATUS_TONES: Record<string, BadgeTone> = {
  unpaid: "warning",
  pending: "info",
  paid: "success",
  failed: "danger",
  refunded: "neutral",
};

const ENQUIRY_STATUS_TONES: Record<string, BadgeTone> = {
  pending: "warning",
  in_progress: "info",
  completed: "success",
  cancelled: "neutral",
};

function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function OrderStatusBadge({ status }: { status: string }) {
  return <StatusBadge label={humanize(status)} tone={ORDER_STATUS_TONES[status] ?? "neutral"} />;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return <StatusBadge label={humanize(status)} tone={PAYMENT_STATUS_TONES[status] ?? "neutral"} />;
}

export function EnquiryStatusBadge({ status }: { status: string }) {
  return <StatusBadge label={humanize(status)} tone={ENQUIRY_STATUS_TONES[status] ?? "neutral"} />;
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <div className={`ws-dash-stat is-${tone}`}>
      <p className="ws-dash-stat-label">{label}</p>
      <p className="ws-dash-stat-value">{value}</p>
      {hint ? <p className="ws-dash-stat-hint">{hint}</p> : null}
    </div>
  );
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="ws-dash-page-head">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ws-dash-page-actions">{actions}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="ws-dash-field">
      <span className="ws-dash-field-label">{label}</span>
      {children}
      {hint ? <span className="ws-dash-field-hint">{hint}</span> : null}
      {error ? <span className="ws-dash-field-error">{error}</span> : null}
    </label>
  );
}
