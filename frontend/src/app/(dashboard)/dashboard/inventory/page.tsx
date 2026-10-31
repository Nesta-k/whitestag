"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader, Field } from "@/components/admin/ui";
import { AdminModal } from "@/components/admin/modal";
import {
  AdminTable,
  AdminPagination,
  type AdminColumn,
} from "@/components/admin/table";
import { useAdminList, useAdminResource } from "@/components/admin/hooks";
import { listAdminProducts } from "@/lib/api/admin/catalogue";
import { describeAdminError } from "@/lib/api/admin/client";
import {
  adjustStock,
  listInventory,
  listStockMovements,
  receiveStock,
} from "@/lib/api/admin/inventory";
import type { AdminProduct, InventoryRecord, StockMovement } from "@/types/admin";

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
  const [stockProductSearch, setStockProductSearch] = useState("");
  const stockProducts = useAdminResource(
    () =>
      listAdminProducts({
        search: stockProductSearch,
        publication_status: "published",
        sales_method: "direct_purchase",
        page_size: 100,
      }),
    [stockProductSearch],
  );
  const [newStockModalOpen, setNewStockModalOpen] = useState(false);
  const [newStockProductId, setNewStockProductId] = useState("");
  const [newStockQuantity, setNewStockQuantity] = useState("");
  const [newStockReason, setNewStockReason] = useState("");
  const [newStockReference, setNewStockReference] = useState("");
  const [newStockBusy, setNewStockBusy] = useState(false);
  const [newStockError, setNewStockError] = useState("");

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

  function openNewStockModal() {
    setStockProductSearch("");
    setNewStockProductId("");
    setNewStockQuantity("");
    setNewStockReason("");
    setNewStockReference("");
    setNewStockError("");
    setNewStockModalOpen(true);
  }

  async function handleNewStockSubmit() {
    setNewStockError("");
    const parsed = Number(newStockQuantity);
    if (!newStockProductId) {
      setNewStockError("Select a product.");
      return;
    }
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setNewStockError("Enter a whole quantity greater than zero.");
      return;
    }

    setNewStockBusy(true);
    try {
      await receiveStock(Number(newStockProductId), {
        quantity: parsed,
        reason: newStockReason,
        reference: newStockReference,
      });
      setNewStockModalOpen(false);
      list.reload();
    } catch (error) {
      setNewStockError(describeAdminError(error));
    } finally {
      setNewStockBusy(false);
    }
  }

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
        actions={
          <button
            type="button"
            className="ws-dash-btn is-primary"
            onClick={openNewStockModal}
          >
            Receive stock for product
          </button>
        }
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
        open={newStockModalOpen}
        title="Receive stock for product"
        onClose={() => setNewStockModalOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="ws-dash-btn is-ghost"
              onClick={() => setNewStockModalOpen(false)}
              disabled={newStockBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ws-dash-btn is-primary"
              onClick={handleNewStockSubmit}
              disabled={newStockBusy}
            >
              {newStockBusy ? "Saving…" : "Receive stock"}
            </button>
          </>
        }
      >
        <p className="ws-dash-note">
          Select a published direct-purchase product. If it has no inventory
          record yet, one will be created when you receive stock.
        </p>
        <Field label="Search products">
          <input
            className="ws-dash-input"
            type="search"
            value={stockProductSearch}
            onChange={(event) => {
              setStockProductSearch(event.target.value);
              setNewStockProductId("");
            }}
          />
        </Field>
        <Field label="Product">
          <select
            className="ws-dash-select"
            value={newStockProductId}
            onChange={(event) => setNewStockProductId(event.target.value)}
            disabled={stockProducts.loading}
          >
            <option value="">
              {stockProducts.loading ? "Loading products…" : "Select a product…"}
            </option>
            {(stockProducts.data?.results ?? []).map((product: AdminProduct) => (
              <option key={product.id} value={String(product.id)}>
                {product.name} ({product.sku})
              </option>
            ))}
          </select>
        </Field>
        {!stockProducts.loading &&
        !stockProducts.error &&
        (stockProducts.data?.results.length ?? 0) === 0 ? (
          <p className="ws-dash-note">
            No published direct-purchase products match this search.
          </p>
        ) : null}
        {stockProducts.error ? (
          <p className="ws-dash-field-error">{stockProducts.error}</p>
        ) : null}
        <Field label="Quantity">
          <input
            className="ws-dash-input"
            type="number"
            min="1"
            step="1"
            value={newStockQuantity}
            onChange={(event) => setNewStockQuantity(event.target.value)}
            required
          />
        </Field>
        <Field label="Reason">
          <input
            className="ws-dash-input"
            type="text"
            value={newStockReason}
            onChange={(event) => setNewStockReason(event.target.value)}
          />
        </Field>
        <Field label="Reference" hint="Optional — e.g. supplier invoice.">
          <input
            className="ws-dash-input"
            type="text"
            value={newStockReference}
            onChange={(event) => setNewStockReference(event.target.value)}
          />
        </Field>
        {newStockError ? (
          <p className="ws-dash-field-error" role="alert">
            {newStockError}
          </p>
        ) : null}
      </AdminModal>

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
