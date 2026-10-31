"use client";

import { useState } from "react";
import { AdminPageHeader, EnquiryStatusBadge, Field } from "@/components/admin/ui";
import { AdminModal } from "@/components/admin/modal";
import {
  AdminTable,
  AdminPagination,
  type AdminColumn,
} from "@/components/admin/table";
import { useAdminList } from "@/components/admin/hooks";
import { describeAdminError } from "@/lib/api/admin/client";
import {
  deleteVehicleEnquiry,
  listVehicleEnquiries,
  updateVehicleEnquiry,
} from "@/lib/api/admin/enquiries";
import type { VehicleEnquiry, VehicleEnquiryStatus } from "@/types/admin";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function EnquiriesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VehicleEnquiryStatus | "">("");
  const list = useAdminList(
    (page) => listVehicleEnquiries({ search, status, page }),
    `${search}|${status}`,
  );

  const [selected, setSelected] = useState<VehicleEnquiry | null>(null);
  const [draftStatus, setDraftStatus] = useState<VehicleEnquiryStatus>("pending");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  function openEnquiry(row: VehicleEnquiry) {
    setSelected(row);
    setDraftStatus(row.status);
    setActionError("");
  }

  function closeEnquiry() {
    setSelected(null);
    setActionError("");
  }

  async function handleSave() {
    if (!selected) return;
    setActionError("");
    setBusy(true);
    try {
      const updated = await updateVehicleEnquiry(selected.id, {
        status: draftStatus,
      });
      setSelected(updated);
      setDraftStatus(updated.status);
      list.reload();
    } catch (error) {
      setActionError(describeAdminError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setActionError("");
    setBusy(true);
    try {
      await deleteVehicleEnquiry(selected.id);
      setSelected(null);
      list.reload();
    } catch (error) {
      setActionError(describeAdminError(error));
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<VehicleEnquiry>[] = [
    {
      key: "product",
      header: "Product",
      render: (row) => (
        <div>
          <strong>{row.product.name}</strong>
          <div className="ws-dash-muted">
            <span className="ws-dash-tag">{row.product.sku}</span>
          </div>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (row) => (
        <div>
          <div>{row.name}</div>
          <div className="ws-dash-muted">{row.email}</div>
          <div className="ws-dash-muted">{row.phone_number}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <EnquiryStatusBadge status={row.status} />,
    },
    {
      key: "received",
      header: "Received",
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <>
      <AdminPageHeader
        title="Product enquiries"
        description="Quotation requests submitted by storefront customers."
      />

      <div className="ws-dash-panel">
        <div className="ws-dash-panel-body">
          <div className="ws-dash-toolbar">
            <input
              className="ws-dash-input ws-dash-search"
              type="search"
              placeholder="Search by name, email or product…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="ws-dash-select"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as VehicleEnquiryStatus | "")
              }
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <div className="ws-dash-toolbar-spacer" />
            <button type="button" className="ws-dash-btn" onClick={list.reload}>
              Refresh
            </button>
          </div>

          <AdminTable<VehicleEnquiry>
            columns={columns}
            rows={list.rows}
            rowKey={(row) => row.id}
            loading={list.loading}
            error={list.error}
            emptyMessage="No enquiries yet."
            onRetry={list.reload}
            onRowClick={(row) => openEnquiry(row)}
          />

          <AdminPagination
            page={list.page}
            totalPages={list.totalPages}
            count={list.count}
            onPageChange={list.setPage}
            noun="enquiries"
          />
        </div>
      </div>

      <AdminModal
        open={selected !== null}
        wide
        title={`Enquiry from ${selected?.name ?? ""}`}
        onClose={closeEnquiry}
        footer={
          <>
            <button
              type="button"
              className="ws-dash-btn is-danger"
              onClick={handleDelete}
              disabled={busy}
            >
              Delete
            </button>
            <button
              type="button"
              className="ws-dash-btn is-ghost"
              onClick={closeEnquiry}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ws-dash-btn is-primary"
              onClick={handleSave}
              disabled={busy}
            >
              Save changes
            </button>
          </>
        }
      >
        {selected ? (
          <>
            <dl className="ws-dash-detail">
              <dt className="ws-dash-detail-term">Product</dt>
              <dd className="ws-dash-detail-value">{selected.product.name}</dd>
              <dt className="ws-dash-detail-term">SKU</dt>
              <dd className="ws-dash-detail-value">{selected.product.sku}</dd>
              <dt className="ws-dash-detail-term">Customer account</dt>
              <dd className="ws-dash-detail-value">
                {selected.customer?.email ?? "Guest"}
              </dd>
              <dt className="ws-dash-detail-term">Name</dt>
              <dd className="ws-dash-detail-value">{selected.name}</dd>
              <dt className="ws-dash-detail-term">Email</dt>
              <dd className="ws-dash-detail-value">{selected.email}</dd>
              <dt className="ws-dash-detail-term">Phone</dt>
              <dd className="ws-dash-detail-value">{selected.phone_number}</dd>
              <dt className="ws-dash-detail-term">Received</dt>
              <dd className="ws-dash-detail-value">
                {formatDate(selected.created_at)}
              </dd>
              <dt className="ws-dash-detail-term">Updated</dt>
              <dd className="ws-dash-detail-value">
                {formatDate(selected.updated_at)}
              </dd>
              <dt className="ws-dash-detail-term">Message</dt>
              <dd className="ws-dash-detail-value">{selected.message || "—"}</dd>
            </dl>

            <Field label="Status">
              <select
                className="ws-dash-select"
                value={draftStatus}
                onChange={(event) =>
                  setDraftStatus(event.target.value as VehicleEnquiryStatus)
                }
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>

            {actionError ? (
              <p className="ws-dash-field-error">{actionError}</p>
            ) : null}
          </>
        ) : null}
      </AdminModal>
    </>
  );
}
