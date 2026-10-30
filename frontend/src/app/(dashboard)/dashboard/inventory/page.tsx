"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader, Field } from "@/components/admin/ui";
import { AdminModal } from "@/components/admin/modal";
import {
  AdminTable,
  AdminPagination,
  type AdminColumn,
} from "@/components/admin/table";
import { useAdminList } from "@/components/admin/hooks";
import { describeAdminError } from "@/lib/api/admin/client";
import {
  adjustStock,
  listInventory,
  listStockMovements,
  receiveStock,
} from "@/lib/api/admin/inventory";
import type { InventoryRecord, StockMovement } from "@/types/admin";

const HISTORY_PAGE_SIZE = 20;

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function humanizeMovement(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const list = useAdminList((page) => listInventory({ search, page }), search);

  const [stockModal, setStockModal] = useState<{
    record: InventoryRecord;
    mode: "receive" | "adjust";
  } | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const [historyRecord, setHistoryRecord] = useState<InventoryRecord | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [historyRows, setHistoryRows] = useState<StockMovement[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!historyRecord) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    listStockMovements(historyRecord.id, { page: historyPage })
      .then((result) => {
        if (cancelled) return;
        setHistoryRows(result.results ?? []);
        setHistoryCount(result.count ?? 0);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setHistoryRows([]);
        setHistoryCount(0);
        setHistoryError(describeAdminError(requestError));
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyRecord, historyPage, historyVersion]);

  function openStockModal(record: InventoryRecord, mode: "receive" | "adjust") {
    setStockModal({ record, mode });
    setQuantity("");
    setReason("");
    setReference("");
    setFormError("");
  }

  function closeStockModal() {
    setStockModal(null);
    setFormError("");
  }

  function openHistory(record: InventoryRecord) {
    setHistoryRecord(record);
    setHistoryPage(1);
    setHistoryVersion((value) => value + 1);
  }

  function reloadHistory() {
    setHistoryVersion((value) => value + 1);
  }

  async function handleStockSubmit() {
    if (!stockModal) return;
    setFormError("");
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      setFormError("Enter a whole number.");
      return;
    }
    if (stockModal.mode === "receive" && parsed <= 0) {
      setFormError("Quantity must be greater than zero.");
      return;
    }
    if (stockModal.mode === "adjust" && parsed === 0) {
      setFormError("Quantity must not be zero.");
      return;
    }
    setBusy(true);
    try {
      const input = { quantity: parsed, reason, reference };
      if (stockModal.mode === "receive") {
        await receiveStock(stockModal.record.product.id, input);
      } else {
        await adjustStock(stockModal.record.product.id, input);
      }
      setStockModal(null);
      setQuantity("");
      setReason("");
      setReference("");
      list.reload();
    } catch (error) {
      setFormError(describeAdminError(error));
    } finally {
      setBusy(false);
    }
  }

  const columns: AdminColumn<InventoryRecord>[] = [
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
      key: "available",
      header: "Available",
      align: "right",
      render: (row) => row.available_quantity,
    },
    {
      key: "reserved",
      header: "Reserved",
      align: "right",
      render: (row) => row.reserved_quantity,
    },
    {
      key: "reorder",
      header: "Reorder threshold",
      align: "right",
      render: (row) => row.reorder_threshold,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (row) => (
        <div className="ws-dash-row-actions">
          <button
            type="button"
            className="ws-dash-btn is-small"
            onClick={() => openStockModal(row, "receive")}
          >
            Receive
          </button>
          <button
            type="button"
            className="ws-dash-btn is-small"
            onClick={() => openStockModal(row, "adjust")}
          >
            Adjust
          </button>
          <button
            type="button"
            className="ws-dash-btn is-small"
            onClick={() => openHistory(row)}
          >
            History
          </button>
        </div>
      ),
    },
  ];

  const movementColumns: AdminColumn<StockMovement>[] = [
    {
      key: "type",
      header: "Type",
      render: (row) => humanizeMovement(row.movement_type),
    },
    {
      key: "quantity",
      header: "Quantity",
      align: "right",
      render: (row) => row.quantity,
    },
    {
      key: "available_delta",
      header: "Available delta",
      align: "right",
      render: (row) => row.available_delta,
    },
    {
      key: "reserved_delta",
      header: "Reserved delta",
      align: "right",
      render: (row) => row.reserved_delta,
    },
    { key: "reason", header: "Reason", render: (row) => row.reason || "—" },
    { key: "reference", header: "Reference", render: (row) => row.reference || "—" },
    { key: "date", header: "Date", render: (row) => formatDate(row.created_at) },
  ];

  const historyTotalPages = Math.max(
    1,
    Math.ceil(historyCount / HISTORY_PAGE_SIZE),
  );

  return (
    <>
      <AdminPageHeader
        title="Inventory"
        description="Stock on hand, reservations and reorder thresholds."
      />

      <div className="ws-dash-panel">
        <div className="ws-dash-panel-body">
          <div className="ws-dash-toolbar">
            <input
              className="ws-dash-input ws-dash-search"
              type="search"
              placeholder="Search by product name or SKU…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="ws-dash-toolbar-spacer" />
            <button type="button" className="ws-dash-btn" onClick={list.reload}>
              Refresh
            </button>
          </div>

          <AdminTable<InventoryRecord>
            columns={columns}
            rows={list.rows}
            rowKey={(row) => row.id}
            loading={list.loading}
            error={list.error}
            emptyMessage="No inventory records yet."
            onRetry={list.reload}
          />

          <AdminPagination
            page={list.page}
            totalPages={list.totalPages}
            count={list.count}
            onPageChange={list.setPage}
            noun="records"
          />
        </div>
      </div>

      <AdminModal
        open={stockModal !== null}
        title={stockModal?.mode === "adjust" ? "Adjust stock" : "Receive stock"}
        onClose={closeStockModal}
        footer={
          <>
            <button
              type="button"
              className="ws-dash-btn is-ghost"
              onClick={closeStockModal}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ws-dash-btn is-primary"
              onClick={handleStockSubmit}
              disabled={busy}
            >
              {busy ? "Saving…" : "Submit"}
            </button>
          </>
        }
      >
        {stockModal ? (
          <>
            <p className="ws-dash-note">
              <span className="ws-dash-tag">{stockModal.record.product.sku}</span>{" "}
              {stockModal.record.product.name} — current available quantity:{" "}
              {stockModal.record.available_quantity}.
            </p>
            <Field
              label="Quantity"
              hint={
                stockModal.mode === "adjust"
                  ? "Use a negative value to reduce stock."
                  : undefined
              }
            >
              <input
                className="ws-dash-input"
                type="number"
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </Field>
            <Field label="Reason">
              <input
                className="ws-dash-input"
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <Field
              label="Reference"
              hint="Optional — e.g. supplier invoice or order reference."
            >
              <input
                className="ws-dash-input"
                type="text"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </Field>
            {formError ? <p className="ws-dash-field-error">{formError}</p> : null}
          </>
        ) : null}
      </AdminModal>

      <AdminModal
        open={historyRecord !== null}
        wide
        title={`Stock movements — ${historyRecord?.product.name ?? ""}`}
        onClose={() => setHistoryRecord(null)}
      >
        <AdminTable<StockMovement>
          columns={movementColumns}
          rows={historyRows}
          rowKey={(row) => row.id}
          loading={historyLoading}
          error={historyError}
          emptyMessage="No stock movements recorded."
          onRetry={reloadHistory}
        />
        <AdminPagination
          page={historyPage}
          totalPages={historyTotalPages}
          count={historyCount}
          onPageChange={setHistoryPage}
          noun="movements"
        />
      </AdminModal>
    </>
  );
}
