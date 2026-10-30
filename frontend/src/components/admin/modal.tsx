"use client";

import { useEffect, type ReactNode } from "react";

export function AdminModal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ws-dash-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`ws-dash-modal${wide ? " is-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ws-dash-modal-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="ws-dash-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="ws-dash-modal-body">{children}</div>
        {footer ? <footer className="ws-dash-modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
