"use client";

import {
  AdminPageHeader,
  OrderStatusBadge,
  PaymentStatusBadge,
  StatCard,
} from "@/components/admin/ui";
import { AdminEmpty, AdminError, AdminLoading } from "@/components/admin/states";
import { AdminTable, type AdminColumn } from "@/components/admin/table";
import { useAdminResource } from "@/components/admin/hooks";
import { getDashboardOverview } from "@/lib/api/admin/orders";
import type { Order } from "@/types/api";
import type { InventoryRecord } from "@/types/admin";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

const recentOrderColumns: AdminColumn<Order>[] = [
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

const lowStockColumns: AdminColumn<InventoryRecord>[] = [
  {
    key: "product",
    header: "Product",
    render: (row) => (
      <div>
        <strong>{row.product.name}</strong>
        <span className="ws-dash-tag">{row.product.sku}</span>
      </div>
    ),
  },
  {
    key: "available",
    header: "Available",
    render: (row) => row.available_quantity,
  },
  {
    key: "reserved",
    header: "Reserved",
    render: (row) => row.reserved_quantity,
  },
  {
    key: "reorder",
    header: "Reorder threshold",
    render: (row) => row.reorder_threshold,
  },
];

export default function OverviewPage() {
  const { data, loading, error, reload } = useAdminResource(() =>
    getDashboardOverview(),
  );

  const totalOrders = data
    ? Object.values(data.orders_by_status).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <>
      <AdminPageHeader
        title="Overview"
        description="Live operational snapshot of orders, revenue and stock."
        actions={
          <button type="button" className="ws-dash-btn" onClick={reload}>
            Refresh
          </button>
        }
      />

      {loading ? <AdminLoading /> : null}
      {!loading && error ? <AdminError message={error} onRetry={reload} /> : null}

      {!loading && !error && data ? (
        <>
          <div className="ws-dash-grid">
            <StatCard
              label="Paid revenue"
              value={`GHS ${data.paid_revenue}`}
              hint={data.currency}
              tone="success"
            />
            <StatCard label="Total orders" value={totalOrders} />
            <StatCard
              label="Awaiting payment"
              value={data.orders_by_payment_status.unpaid ?? 0}
              tone="warning"
            />
            <StatCard
              label="Low stock items"
              value={data.low_stock_count}
              tone="danger"
            />
          </div>

          <section className="ws-dash-panel">
            <header className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Orders by status</h2>
            </header>
            <div className="ws-dash-panel-body">
              {Object.keys(data.orders_by_status).length === 0 ? (
                <AdminEmpty message="No orders yet." />
              ) : (
                <ul className="ws-dash-list">
                  {Object.entries(data.orders_by_status).map(([status, count]) => (
                    <li className="ws-dash-list-item" key={status}>
                      <OrderStatusBadge status={status} />
                      <strong>{count}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="ws-dash-panel">
            <header className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Payments by status</h2>
            </header>
            <div className="ws-dash-panel-body">
              {Object.keys(data.orders_by_payment_status).length === 0 ? (
                <AdminEmpty message="No payments yet." />
              ) : (
                <ul className="ws-dash-list">
                  {Object.entries(data.orders_by_payment_status).map(
                    ([status, count]) => (
                      <li className="ws-dash-list-item" key={status}>
                        <PaymentStatusBadge status={status} />
                        <strong>{count}</strong>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          </section>

          <section className="ws-dash-panel">
            <header className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Recent orders</h2>
            </header>
            <AdminTable<Order>
              columns={recentOrderColumns}
              rows={data.recent_orders}
              rowKey={(row) => row.id}
              emptyMessage="No recent orders."
            />
          </section>

          <section className="ws-dash-panel">
            <header className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Low stock</h2>
            </header>
            <AdminTable<InventoryRecord>
              columns={lowStockColumns}
              rows={data.low_stock}
              rowKey={(row) => row.id}
              emptyMessage="Stock levels are healthy."
            />
          </section>

          {data.unavailable_features?.length ? (
            <p className="ws-dash-note">
              Not yet available: {data.unavailable_features.join(", ")}
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}
