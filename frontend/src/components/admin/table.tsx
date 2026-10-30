"use client";

import type { ReactNode } from "react";
import { AdminEmpty, AdminError, AdminLoading } from "./states";

export interface AdminColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
}

interface AdminTableProps<T> {
  columns: AdminColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
}

export function AdminTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  emptyMessage = "Nothing to show yet.",
  onRetry,
  onRowClick,
}: AdminTableProps<T>) {
  if (loading) return <AdminLoading />;
  if (error) return <AdminError message={error} onRetry={onRetry} />;
  if (!rows.length) return <AdminEmpty message={emptyMessage} />;

  return (
    <div className="ws-dash-table-wrap">
      <table className="ws-dash-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={column.width ? { width: column.width } : undefined}
                className={column.align ? `is-${column.align}` : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "is-clickable" : undefined}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.align ? `is-${column.align}` : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPagination({
  page,
  totalPages,
  count,
  onPageChange,
  noun = "items",
}: {
  page: number;
  totalPages: number;
  count: number;
  onPageChange: (page: number) => void;
  noun?: string;
}) {
  if (count === 0) return null;
  return (
    <div className="ws-dash-pagination">
      <span>
        Page {page} of {totalPages} · {count} {noun}
      </span>
      <div className="ws-dash-pagination-controls">
        <button
          type="button"
          className="ws-dash-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </button>
        <button
          type="button"
          className="ws-dash-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}
