"use client";

import { useState } from "react";
import {
  AdminPageHeader,
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/admin/ui";
import {
  AdminTable,
  AdminPagination,
  type AdminColumn,
} from "@/components/admin/table";
import { AdminModal } from "@/components/admin/modal";
import { useAdminList } from "@/components/admin/hooks";
import { completeStaffOrder, listStaffOrders } from "@/lib/api/admin/orders";
import { describeAdminError } from "@/lib/api/admin/client";
import { can } from "@/lib/admin/capabilities";
import { useStaffAuth } from "@/store/staff-auth-context";
import type { Order, OrderItem } from "@/types/api";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

const orderColumns: AdminColumn<Order>[] = [
  {
    key: "reference",
    header: "Reference",
    render: (row) => row.public_reference,
  },
  {
    key: "customer",
    header: "Customer",
    render: (row) => (
      <div>
        <strong>{row.shipping_full_name}</strong>
        <div className="ws-dash-muted">{row.shipping_email}</div>
      </div>
    ),
  },
  {
    key: "total",
    header: "Total",
    render: (row) => `GHS ${row.total}`,
  },
  {
    key: "status",
    header: "Status",
    render: (row) => <OrderStatusBadge status={row.status} />,
  },
  {
    key: "payment",
    header: "Payment",
    render: (row) => <PaymentStatusBadge status={row.payment_status} />,
  },
  {
    key: "placed",
    header: "Placed",
    render: (row) => formatDate(row.created_at),
  },
];

const itemColumns: AdminColumn<OrderItem>[] = [
  {
    key: "product",
    header: "Product",
    render: (item) => (
      <div>
        <strong>{item.product_name}</strong>
        <span className="ws-dash-tag">{item.product_sku}</span>
      </div>
    ),
  },
  {
    key: "quantity",
    header: "Qty",
    render: (item) => item.quantity,
  },
  {
    key: "unit_price",
    header: "Unit price",
    render: (item) => `GHS ${item.unit_price}`,
  },
  {
    key: "line_total",
    header: "Line total",
    render: (item) => `GHS ${item.line_total}`,
  },
];

export default function OrdersPage() {
  const { role } = useStaffAuth();
  const list = useAdminList((page) => listStaffOrders({ page }));
  const [selected, setSelected] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const closeModal = () => {
    setSelected(null);
    setActionError("");
  };

  const shipTo = selected
    ? [
        selected.shipping_address_line_1,
        selected.shipping_address_line_2,
        selected.shipping_city,
        selected.shipping_region,
        selected.shipping_postal_code,
        selected.shipping_country,
      ]
        .filter((part) => part)
        .join(", ")
    : "";

  const canComplete =
    selected !== null &&
    can(role, "orders.complete") &&
    selected.status !== "completed" &&
    selected.status !== "cancelled";

  const handleComplete = async () => {
    if (!selected) return;
    setBusy(true);
    setActionError("");
    try {
      const updated = await completeStaffOrder(selected.public_reference);
      setSelected(updated);
      list.reload();
    } catch (error) {
      setActionError(describeAdminError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Orders"
        description="Every storefront order, newest first."
        actions={
          <button type="button" className="ws-dash-btn" onClick={list.reload}>
            Refresh
          </button>
        }
      />

      <div className="ws-dash-toolbar">
        <span className="ws-dash-muted">{list.count} orders</span>
        <div className="ws-dash-toolbar-spacer" />
        <button type="button" className="ws-dash-btn" onClick={list.reload}>
          Refresh
        </button>
      </div>

      <AdminTable<Order>
        columns={orderColumns}
        rows={list.rows}
        rowKey={(row) => row.id}
        loading={list.loading}
        error={list.error}
        emptyMessage="No orders yet."
        onRetry={list.reload}
        onRowClick={(row) => setSelected(row)}
      />

      <AdminPagination
        page={list.page}
        totalPages={list.totalPages}
        count={list.count}
        onPageChange={list.setPage}
        noun="orders"
      />

      <AdminModal
        open={selected !== null}
        title={`Order ${selected?.public_reference ?? ""}`}
        onClose={closeModal}
        wide
        footer={
          <>
            <button
              type="button"
              className="ws-dash-btn is-ghost"
              onClick={closeModal}
              disabled={busy}
            >
              Close
            </button>
            {canComplete ? (
              <button
                type="button"
                className="ws-dash-btn is-primary"
                onClick={handleComplete}
                disabled={busy}
              >
                {busy ? "Completing…" : "Mark as completed"}
              </button>
            ) : null}
          </>
        }
      >
        {selected ? (
          <>
            <div className="ws-dash-row-actions">
              <OrderStatusBadge status={selected.status} />
              <PaymentStatusBadge status={selected.payment_status} />
            </div>

            <dl className="ws-dash-detail">
              <dt className="ws-dash-detail-term">Placed</dt>
              <dd className="ws-dash-detail-value">
                {formatDate(selected.created_at)}
              </dd>

              <dt className="ws-dash-detail-term">Updated</dt>
              <dd className="ws-dash-detail-value">
                {formatDate(selected.updated_at)}
              </dd>

              <dt className="ws-dash-detail-term">Subtotal</dt>
              <dd className="ws-dash-detail-value">GHS {selected.subtotal}</dd>

              <dt className="ws-dash-detail-term">Delivery fee</dt>
              <dd className="ws-dash-detail-value">GHS {selected.delivery_fee}</dd>

              <dt className="ws-dash-detail-term">Discount</dt>
              <dd className="ws-dash-detail-value">GHS {selected.discount}</dd>

              <dt className="ws-dash-detail-term">Total</dt>
              <dd className="ws-dash-detail-value">GHS {selected.total}</dd>

              <dt className="ws-dash-detail-term">Delivery zone</dt>
              <dd className="ws-dash-detail-value">
                {selected.delivery_zone_name || "—"}
              </dd>

              <dt className="ws-dash-detail-term">Customer</dt>
              <dd className="ws-dash-detail-value">
                <div>{selected.shipping_full_name}</div>
                <div>{selected.shipping_email}</div>
                <div>{selected.shipping_phone}</div>
              </dd>

              <dt className="ws-dash-detail-term">Ship to</dt>
              <dd className="ws-dash-detail-value">{shipTo || "—"}</dd>
            </dl>

            <h3 className="ws-dash-panel-title">Items</h3>
            <AdminTable<OrderItem>
              columns={itemColumns}
              rows={selected.items}
              rowKey={(item) => item.id}
              emptyMessage="No line items."
            />

            {actionError ? (
              <p className="ws-dash-field-error">{actionError}</p>
            ) : null}
          </>
        ) : null}
      </AdminModal>
    </>
  );
}
