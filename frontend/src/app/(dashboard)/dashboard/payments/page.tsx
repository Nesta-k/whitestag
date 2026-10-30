"use client";

import { useState } from "react";
import { AdminPageHeader, PaymentStatusBadge } from "@/components/admin/ui";
import {
  AdminTable,
  AdminPagination,
  type AdminColumn,
} from "@/components/admin/table";
import { AdminModal } from "@/components/admin/modal";
import { useAdminList } from "@/components/admin/hooks";
import { listStaffPayments, refundPayment } from "@/lib/api/admin/orders";
import { describeAdminError } from "@/lib/api/admin/client";
import { can } from "@/lib/admin/capabilities";
import { useStaffAuth } from "@/store/staff-auth-context";
import type { StaffPayment } from "@/types/admin";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function PaymentsPage() {
  const { role } = useStaffAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const list = useAdminList(
    (page) => listStaffPayments({ search, status, page }),
    `${search}|${status}`,
  );

  const [pendingRefund, setPendingRefund] = useState<StaffPayment | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState("");

  const columns: AdminColumn<StaffPayment>[] = [
    {
      key: "reference",
      header: "Reference",
      render: (row) => row.reference,
    },
    {
      key: "order",
      header: "Order",
      render: (row) => row.order_reference,
    },
    {
      key: "customer",
      header: "Customer",
      render: (row) => row.customer_email,
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => `GHS ${row.amount}`,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <PaymentStatusBadge status={row.status} />,
    },
    {
      key: "date",
      header: "Date",
      render: (row) => formatDate(row.created_at),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (row) =>
        can(role, "payments.refund") && row.status === "paid" ? (
          <button
            type="button"
            className="ws-dash-btn is-small is-danger"
            onClick={(event) => {
              event.stopPropagation();
              setRefundError("");
              setPendingRefund(row);
            }}
          >
            Refund
          </button>
        ) : (
          <span className="ws-dash-muted">—</span>
        ),
    },
  ];

  const handleRefund = async () => {
    if (!pendingRefund) return;
    setRefunding(true);
    setRefundError("");
    try {
      await refundPayment(pendingRefund.reference);
      setPendingRefund(null);
      list.reload();
    } catch (error) {
      setRefundError(describeAdminError(error));
    } finally {
      setRefunding(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Payments"
        description="Paystack transactions and refunds. Refunds are available to Admin and Superadmin accounts."
      />

      <div className="ws-dash-toolbar">
        <input
          className="ws-dash-input ws-dash-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by reference or customer…"
        />
        <select
          className="ws-dash-select"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <div className="ws-dash-toolbar-spacer" />
        <button type="button" className="ws-dash-btn" onClick={list.reload}>
          Refresh
        </button>
      </div>

      <AdminTable<StaffPayment>
        columns={columns}
        rows={list.rows}
        rowKey={(row) => row.reference}
        loading={list.loading}
        error={list.error}
        emptyMessage="No payments yet."
        onRetry={list.reload}
      />

      <AdminPagination
        page={list.page}
        totalPages={list.totalPages}
        count={list.count}
        onPageChange={list.setPage}
        noun="payments"
      />

      <AdminModal
        open={pendingRefund !== null}
        title="Refund payment"
        onClose={() => {
          if (refunding) return;
          setPendingRefund(null);
          setRefundError("");
        }}
        footer={
          <>
            <button
              type="button"
              className="ws-dash-btn is-ghost"
              onClick={() => {
                setPendingRefund(null);
                setRefundError("");
              }}
              disabled={refunding}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ws-dash-btn is-danger"
              onClick={handleRefund}
              disabled={refunding}
            >
              {refunding ? "Refunding…" : "Confirm refund"}
            </button>
          </>
        }
      >
        <p>
          Refund GHS {pendingRefund?.amount} for payment{" "}
          {pendingRefund?.reference}. This action cannot be undone.
        </p>
        {refundError ? (
          <p className="ws-dash-field-error">{refundError}</p>
        ) : null}
      </AdminModal>
    </>
  );
}
