"use client";

import type { ReactNode } from "react";

export function AdminLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="ws-dash-state" role="status">
      <span className="ws-dash-spinner" aria-hidden />
      <p>{label}</p>
    </div>
  );
}

export function AdminError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ws-dash-state ws-dash-state-error" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="ws-dash-btn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function AdminEmpty({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="ws-dash-state ws-dash-state-empty">
      <p>{message}</p>
      {action}
    </div>
  );
}
