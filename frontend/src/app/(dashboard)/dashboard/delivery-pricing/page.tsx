"use client";

import { useState } from "react";
import { AdminPageHeader, Field, StatusBadge } from "@/components/admin/ui";
import { AdminEmpty, AdminError, AdminLoading } from "@/components/admin/states";
import { AdminModal } from "@/components/admin/modal";
import {
  AdminTable,
  AdminPagination,
  type AdminColumn,
} from "@/components/admin/table";
import { useAdminList, useAdminResource } from "@/components/admin/hooks";
import { describeAdminError } from "@/lib/api/admin/client";
import { can } from "@/lib/admin/capabilities";
import { useStaffAuth } from "@/store/staff-auth-context";
import {
  createDeliverySurcharge,
  createDeliveryZone,
  createPricingConfiguration,
  getStaffDeliveryPricing,
  listDeliveryPricingAudit,
  listDeliverySurcharges,
  listDeliveryZones,
  listPricingConfigurations,
  updateDeliverySurcharge,
  updateDeliveryZone,
  updatePricingConfiguration,
} from "@/lib/api/admin/orders";
import type {
  DeliveryPricingAuditEntry,
  DeliveryPricingConfiguration,
  StaffDeliverySurcharge,
  StaffDeliveryZone,
} from "@/types/admin";
import type { PaginatedResponse } from "@/types/api";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function money(value?: string | null): string {
  return value ? `GHS ${value}` : "—";
}

function emptyPage<T>(): Promise<PaginatedResponse<T>> {
  return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
}

export default function DeliveryPricingPage() {
  const { role } = useStaffAuth();
  const canConfigure = can(role, "delivery.configure");

  const summary = useAdminResource(() => getStaffDeliveryPricing());

  const configs = useAdminList(
    (page) =>
      canConfigure
        ? listPricingConfigurations({ page })
        : emptyPage<DeliveryPricingConfiguration>(),
    String(canConfigure),
  );

  const zones = useAdminList(
    (page) =>
      canConfigure
        ? listDeliveryZones({ page })
        : emptyPage<StaffDeliveryZone>(),
    String(canConfigure),
  );

  const surcharges = useAdminList(
    (page) =>
      canConfigure
        ? listDeliverySurcharges({ page })
        : emptyPage<StaffDeliverySurcharge>(),
    String(canConfigure),
  );

  const audit = useAdminList(
    (page) =>
      canConfigure
        ? listDeliveryPricingAudit({ page })
        : emptyPage<DeliveryPricingAuditEntry>(),
    String(canConfigure),
  );

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configEditing, setConfigEditing] =
    useState<DeliveryPricingConfiguration | null>(null);
  const [configSubmitting, setConfigSubmitting] = useState(false);
  const [configError, setConfigError] = useState("");
  const [version, setVersion] = useState("");
  const [baseFee, setBaseFee] = useState("");
  const [ratePerKm, setRatePerKm] = useState("");
  const [ratePerKg, setRatePerKg] = useState("");
  const [minimumFee, setMinimumFee] = useState("");
  const [maximumFee, setMaximumFee] = useState("");
  const [roundingMode, setRoundingMode] = useState("");
  const [configIsActive, setConfigIsActive] = useState(false);

  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [zoneEditing, setZoneEditing] = useState<StaffDeliveryZone | null>(null);
  const [zoneSubmitting, setZoneSubmitting] = useState(false);
  const [zoneError, setZoneError] = useState("");
  const [code, setCode] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [estimatedDistanceKm, setEstimatedDistanceKm] = useState("");
  const [zoneIsActive, setZoneIsActive] = useState(false);

  const [surchargeModalOpen, setSurchargeModalOpen] = useState(false);
  const [surchargeEditing, setSurchargeEditing] =
    useState<StaffDeliverySurcharge | null>(null);
  const [surchargeSubmitting, setSurchargeSubmitting] = useState(false);
  const [surchargeError, setSurchargeError] = useState("");
  const [surchargeCode, setSurchargeCode] = useState("");
  const [surchargeName, setSurchargeName] = useState("");
  const [amount, setAmount] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [surchargeIsActive, setSurchargeIsActive] = useState(false);

  const activeConfig = summary.data?.active_configuration ?? null;

  function openConfigCreate() {
    setConfigEditing(null);
    setVersion("");
    setBaseFee("");
    setRatePerKm("");
    setRatePerKg("");
    setMinimumFee("");
    setMaximumFee("");
    setRoundingMode("");
    setConfigIsActive(false);
    setConfigError("");
    setConfigModalOpen(true);
  }

  function openConfigEdit(row: DeliveryPricingConfiguration) {
    setConfigEditing(row);
    setVersion(row.version);
    setBaseFee(row.base_fee);
    setRatePerKm(row.rate_per_km);
    setRatePerKg(row.rate_per_kg);
    setMinimumFee(row.minimum_fee);
    setMaximumFee(row.maximum_fee ?? "");
    setRoundingMode(row.rounding_mode);
    setConfigIsActive(row.is_active);
    setConfigError("");
    setConfigModalOpen(true);
  }

  function closeConfigModal() {
    setConfigModalOpen(false);
    setConfigEditing(null);
    setConfigError("");
  }

  async function submitConfig() {
    setConfigError("");
    setConfigSubmitting(true);
    try {
      const payload = {
        base_fee: baseFee,
        rate_per_km: ratePerKm,
        rate_per_kg: ratePerKg,
        minimum_fee: minimumFee,
        maximum_fee: maximumFee || null,
        rounding_mode: roundingMode,
        is_active: configIsActive,
        ...(version.trim() ? { version: version.trim() } : {}),
      };
      if (configEditing) {
        await updatePricingConfiguration(configEditing.id, payload);
      } else {
        await createPricingConfiguration(payload);
      }
      setConfigModalOpen(false);
      setConfigEditing(null);
      configs.reload();
      summary.reload();
    } catch (error) {
      setConfigError(describeAdminError(error));
    } finally {
      setConfigSubmitting(false);
    }
  }

  function openZoneCreate() {
    setZoneEditing(null);
    setCode("");
    setZoneName("");
    setCity("");
    setRegion("");
    setEstimatedDistanceKm("");
    setZoneIsActive(false);
    setZoneError("");
    setZoneModalOpen(true);
  }

  function openZoneEdit(row: StaffDeliveryZone) {
    setZoneEditing(row);
    setCode(row.code);
    setZoneName(row.name);
    setCity(row.city);
    setRegion(row.region);
    setEstimatedDistanceKm(row.estimated_distance_km ?? "");
    setZoneIsActive(row.is_active);
    setZoneError("");
    setZoneModalOpen(true);
  }

  function closeZoneModal() {
    setZoneModalOpen(false);
    setZoneEditing(null);
    setZoneError("");
  }

  async function submitZone() {
    setZoneError("");
    setZoneSubmitting(true);
    try {
      const payload = {
        code: code.trim(),
        name: zoneName,
        city,
        region,
        estimated_distance_km: estimatedDistanceKm || null,
        is_active: zoneIsActive,
      };
      if (zoneEditing) {
        await updateDeliveryZone(zoneEditing.id, payload);
      } else {
        await createDeliveryZone(payload);
      }
      setZoneModalOpen(false);
      setZoneEditing(null);
      zones.reload();
      summary.reload();
    } catch (error) {
      setZoneError(describeAdminError(error));
    } finally {
      setZoneSubmitting(false);
    }
  }

  function openSurchargeCreate() {
    setSurchargeEditing(null);
    setSurchargeCode("");
    setSurchargeName("");
    setAmount("");
    setZoneId("");
    setSurchargeIsActive(false);
    setSurchargeError("");
    setSurchargeModalOpen(true);
  }

  function openSurchargeEdit(row: StaffDeliverySurcharge) {
    setSurchargeEditing(row);
    setSurchargeCode(row.code);
    setSurchargeName(row.name);
    setAmount(row.amount);
    setZoneId(row.zone_id ? String(row.zone_id) : "");
    setSurchargeIsActive(row.is_active);
    setSurchargeError("");
    setSurchargeModalOpen(true);
  }

  function closeSurchargeModal() {
    setSurchargeModalOpen(false);
    setSurchargeEditing(null);
    setSurchargeError("");
  }

  async function submitSurcharge() {
    setSurchargeError("");
    setSurchargeSubmitting(true);
    try {
      const payload = {
        code: surchargeCode.trim(),
        name: surchargeName,
        amount,
        zone_id: zoneId ? Number(zoneId) : null,
        is_active: surchargeIsActive,
      };
      if (surchargeEditing) {
        await updateDeliverySurcharge(surchargeEditing.id, payload);
      } else {
        await createDeliverySurcharge(payload);
      }
      setSurchargeModalOpen(false);
      setSurchargeEditing(null);
      surcharges.reload();
      summary.reload();
    } catch (error) {
      setSurchargeError(describeAdminError(error));
    } finally {
      setSurchargeSubmitting(false);
    }
  }

  const summaryZoneColumns: AdminColumn<StaffDeliveryZone>[] = [
    { key: "code", header: "Code", render: (row) => row.code },
    { key: "name", header: "Name", render: (row) => row.name },
    { key: "city", header: "City", render: (row) => row.city },
    { key: "region", header: "Region", render: (row) => row.region },
    {
      key: "distance",
      header: "Est. distance (km)",
      render: (row) => row.estimated_distance_km ?? "—",
    },
    {
      key: "active",
      header: "Active",
      render: (row) => (
        <StatusBadge
          label={row.is_active ? "Active" : "Inactive"}
          tone={row.is_active ? "success" : "neutral"}
        />
      ),
    },
  ];

  const summarySurchargeColumns: AdminColumn<StaffDeliverySurcharge>[] = [
    { key: "code", header: "Code", render: (row) => row.code },
    { key: "name", header: "Name", render: (row) => row.name },
    { key: "amount", header: "Amount", render: (row) => money(row.amount) },
    {
      key: "zone",
      header: "Zone",
      render: (row) => row.zone_code ?? "All zones",
    },
    {
      key: "active",
      header: "Active",
      render: (row) => (
        <StatusBadge
          label={row.is_active ? "Active" : "Inactive"}
          tone={row.is_active ? "success" : "neutral"}
        />
      ),
    },
  ];

  const configColumns: AdminColumn<DeliveryPricingConfiguration>[] = [
    { key: "version", header: "Version", render: (row) => row.version },
    {
      key: "active",
      header: "Active",
      render: (row) => (
        <StatusBadge
          label={row.is_active ? "Active" : "Inactive"}
          tone={row.is_active ? "success" : "neutral"}
        />
      ),
    },
    { key: "base", header: "Base fee", render: (row) => money(row.base_fee) },
    { key: "km", header: "Per km", render: (row) => money(row.rate_per_km) },
    { key: "kg", header: "Per kg", render: (row) => money(row.rate_per_kg) },
    {
      key: "minimum",
      header: "Min fee",
      render: (row) => money(row.minimum_fee),
    },
    {
      key: "maximum",
      header: "Max fee",
      render: (row) => row.maximum_fee ?? "—",
    },
    {
      key: "updated",
      header: "Updated",
      render: (row) => formatDate(row.updated_at),
    },
    {
      key: "actions",
      header: "Edit",
      align: "right",
      render: (row) => (
        <button
          type="button"
          className="ws-dash-btn is-small"
          onClick={() => openConfigEdit(row)}
        >
          Edit
        </button>
      ),
    },
  ];

  const zoneColumns: AdminColumn<StaffDeliveryZone>[] = [
    { key: "code", header: "Code", render: (row) => row.code },
    { key: "name", header: "Name", render: (row) => row.name },
    { key: "city", header: "City", render: (row) => row.city },
    { key: "region", header: "Region", render: (row) => row.region },
    {
      key: "distance",
      header: "Est. distance km",
      render: (row) => row.estimated_distance_km ?? "—",
    },
    {
      key: "active",
      header: "Active",
      render: (row) => (
        <StatusBadge
          label={row.is_active ? "Active" : "Inactive"}
          tone={row.is_active ? "success" : "neutral"}
        />
      ),
    },
    {
      key: "actions",
      header: "Edit",
      align: "right",
      render: (row) => (
        <button
          type="button"
          className="ws-dash-btn is-small"
          onClick={() => openZoneEdit(row)}
        >
          Edit
        </button>
      ),
    },
  ];

  const surchargeColumns: AdminColumn<StaffDeliverySurcharge>[] = [
    { key: "code", header: "Code", render: (row) => row.code },
    { key: "name", header: "Name", render: (row) => row.name },
    { key: "amount", header: "Amount", render: (row) => money(row.amount) },
    {
      key: "zone",
      header: "Zone",
      render: (row) => row.zone_code ?? "All zones",
    },
    {
      key: "active",
      header: "Active",
      render: (row) => (
        <StatusBadge
          label={row.is_active ? "Active" : "Inactive"}
          tone={row.is_active ? "success" : "neutral"}
        />
      ),
    },
    {
      key: "actions",
      header: "Edit",
      align: "right",
      render: (row) => (
        <button
          type="button"
          className="ws-dash-btn is-small"
          onClick={() => openSurchargeEdit(row)}
        >
          Edit
        </button>
      ),
    },
  ];

  const auditColumns: AdminColumn<DeliveryPricingAuditEntry>[] = [
    {
      key: "type",
      header: "Type",
      render: (row) => humanize(row.configuration_type),
    },
    { key: "object", header: "Object", render: (row) => row.object_label },
    { key: "action", header: "Action", render: (row) => humanize(row.action) },
    {
      key: "actor",
      header: "Actor",
      render: (row) => row.actor_username ?? "system",
    },
    { key: "when", header: "When", render: (row) => formatDate(row.created_at) },
  ];

  return (
    <>
      <AdminPageHeader
        title="Delivery pricing"
        description="Fuel, distance and weight based delivery fees applied at checkout."
      />

      {summary.loading ? (
        <AdminLoading />
      ) : summary.error ? (
        <AdminError message={summary.error} onRetry={summary.reload} />
      ) : (
        <>
          <div className="ws-dash-panel">
            <div className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Active configuration</h2>
            </div>
            <div className="ws-dash-panel-body">
              {activeConfig ? (
                <dl className="ws-dash-detail">
                  <dt className="ws-dash-detail-term">Version</dt>
                  <dd className="ws-dash-detail-value">{activeConfig.version}</dd>
                  <dt className="ws-dash-detail-term">Base fee</dt>
                  <dd className="ws-dash-detail-value">
                    {money(activeConfig.base_fee)}
                  </dd>
                  <dt className="ws-dash-detail-term">Rate per km</dt>
                  <dd className="ws-dash-detail-value">
                    {money(activeConfig.rate_per_km)}
                  </dd>
                  <dt className="ws-dash-detail-term">Rate per kg</dt>
                  <dd className="ws-dash-detail-value">
                    {money(activeConfig.rate_per_kg)}
                  </dd>
                  <dt className="ws-dash-detail-term">Minimum fee</dt>
                  <dd className="ws-dash-detail-value">
                    {money(activeConfig.minimum_fee)}
                  </dd>
                  <dt className="ws-dash-detail-term">Maximum fee</dt>
                  <dd className="ws-dash-detail-value">
                    {activeConfig.maximum_fee
                      ? money(activeConfig.maximum_fee)
                      : "No cap"}
                  </dd>
                  <dt className="ws-dash-detail-term">Currency</dt>
                  <dd className="ws-dash-detail-value">
                    {activeConfig.currency}
                  </dd>
                  <dt className="ws-dash-detail-term">Rounding</dt>
                  <dd className="ws-dash-detail-value">
                    {activeConfig.rounding_mode}
                  </dd>
                  <dt className="ws-dash-detail-term">
                    Weight review threshold kg
                  </dt>
                  <dd className="ws-dash-detail-value">
                    {activeConfig.review_weight_threshold_kg ?? "—"}
                  </dd>
                  <dt className="ws-dash-detail-term">
                    Distance review threshold km
                  </dt>
                  <dd className="ws-dash-detail-value">
                    {activeConfig.review_distance_threshold_km ?? "—"}
                  </dd>
                  <dt className="ws-dash-detail-term">Fee review threshold</dt>
                  <dd className="ws-dash-detail-value">
                    {activeConfig.review_fee_threshold ?? "—"}
                  </dd>
                </dl>
              ) : (
                <AdminEmpty message="No active pricing configuration." />
              )}
            </div>
          </div>

          <div className="ws-dash-panel">
            <div className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Delivery zones</h2>
            </div>
            <div className="ws-dash-panel-body">
              <AdminTable<StaffDeliveryZone>
                columns={summaryZoneColumns}
                rows={summary.data?.zones ?? []}
                rowKey={(row) => row.id}
                emptyMessage="No delivery zones configured."
              />
            </div>
          </div>

          <div className="ws-dash-panel">
            <div className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Surcharges</h2>
            </div>
            <div className="ws-dash-panel-body">
              <AdminTable<StaffDeliverySurcharge>
                columns={summarySurchargeColumns}
                rows={summary.data?.surcharges ?? []}
                rowKey={(row) => row.id}
                emptyMessage="No surcharges configured."
              />
            </div>
          </div>
        </>
      )}

      {!canConfigure ? (
        <p className="ws-dash-note">
          Configuring delivery pricing requires an Admin or Superadmin account.
          You can review the current settings above, but changes must be made by
          an administrator.
        </p>
      ) : (
        <>
          <div className="ws-dash-panel">
            <div className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Pricing configurations</h2>
              <button
                type="button"
                className="ws-dash-btn is-primary"
                onClick={openConfigCreate}
              >
                New configuration
              </button>
            </div>
            <div className="ws-dash-panel-body">
              <AdminTable<DeliveryPricingConfiguration>
                columns={configColumns}
                rows={configs.rows}
                rowKey={(row) => row.id}
                loading={configs.loading}
                error={configs.error}
                emptyMessage="No pricing configurations yet."
                onRetry={configs.reload}
              />
              <AdminPagination
                page={configs.page}
                totalPages={configs.totalPages}
                count={configs.count}
                onPageChange={configs.setPage}
                noun="configurations"
              />
            </div>
          </div>

          <div className="ws-dash-panel">
            <div className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Delivery zones</h2>
              <button
                type="button"
                className="ws-dash-btn is-primary"
                onClick={openZoneCreate}
              >
                New zone
              </button>
            </div>
            <div className="ws-dash-panel-body">
              <AdminTable<StaffDeliveryZone>
                columns={zoneColumns}
                rows={zones.rows}
                rowKey={(row) => row.id}
                loading={zones.loading}
                error={zones.error}
                emptyMessage="No delivery zones configured."
                onRetry={zones.reload}
              />
              <AdminPagination
                page={zones.page}
                totalPages={zones.totalPages}
                count={zones.count}
                onPageChange={zones.setPage}
                noun="zones"
              />
            </div>
          </div>

          <div className="ws-dash-panel">
            <div className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Surcharges</h2>
              <button
                type="button"
                className="ws-dash-btn is-primary"
                onClick={openSurchargeCreate}
              >
                New surcharge
              </button>
            </div>
            <div className="ws-dash-panel-body">
              <AdminTable<StaffDeliverySurcharge>
                columns={surchargeColumns}
                rows={surcharges.rows}
                rowKey={(row) => row.id}
                loading={surcharges.loading}
                error={surcharges.error}
                emptyMessage="No surcharges configured."
                onRetry={surcharges.reload}
              />
              <AdminPagination
                page={surcharges.page}
                totalPages={surcharges.totalPages}
                count={surcharges.count}
                onPageChange={surcharges.setPage}
                noun="surcharges"
              />
            </div>
          </div>

          <div className="ws-dash-panel">
            <div className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Audit log</h2>
            </div>
            <div className="ws-dash-panel-body">
              <AdminTable<DeliveryPricingAuditEntry>
                columns={auditColumns}
                rows={audit.rows}
                rowKey={(row) => `${row.configuration_type}-${row.object_id}-${row.created_at}`}
                loading={audit.loading}
                error={audit.error}
                emptyMessage="No pricing changes recorded yet."
                onRetry={audit.reload}
              />
              <AdminPagination
                page={audit.page}
                totalPages={audit.totalPages}
                count={audit.count}
                onPageChange={audit.setPage}
                noun="entries"
              />
            </div>
          </div>

          <AdminModal
            open={configModalOpen}
            wide
            title={configEditing ? "Edit configuration" : "New configuration"}
            onClose={closeConfigModal}
            footer={
              <>
                <button
                  type="button"
                  className="ws-dash-btn is-ghost"
                  onClick={closeConfigModal}
                  disabled={configSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ws-dash-btn is-primary"
                  onClick={submitConfig}
                  disabled={configSubmitting}
                >
                  {configSubmitting ? "Saving…" : "Save"}
                </button>
              </>
            }
          >
            <div className="ws-dash-form-grid">
              <Field label="Version">
                <input
                  className="ws-dash-input"
                  type="text"
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                />
              </Field>
              <Field label="Rounding mode">
                <input
                  className="ws-dash-input"
                  type="text"
                  value={roundingMode}
                  onChange={(event) => setRoundingMode(event.target.value)}
                />
              </Field>
              <Field label="Base fee (GHS)">
                <input
                  className="ws-dash-input"
                  type="number"
                  step="0.01"
                  value={baseFee}
                  onChange={(event) => setBaseFee(event.target.value)}
                />
              </Field>
              <Field label="Rate per km (GHS)">
                <input
                  className="ws-dash-input"
                  type="number"
                  step="0.01"
                  value={ratePerKm}
                  onChange={(event) => setRatePerKm(event.target.value)}
                />
              </Field>
              <Field label="Rate per kg (GHS)">
                <input
                  className="ws-dash-input"
                  type="number"
                  step="0.01"
                  value={ratePerKg}
                  onChange={(event) => setRatePerKg(event.target.value)}
                />
              </Field>
              <Field label="Minimum fee (GHS)">
                <input
                  className="ws-dash-input"
                  type="number"
                  step="0.01"
                  value={minimumFee}
                  onChange={(event) => setMinimumFee(event.target.value)}
                />
              </Field>
              <Field label="Maximum fee (GHS)" hint="Leave blank for no cap.">
                <input
                  className="ws-dash-input"
                  type="number"
                  step="0.01"
                  value={maximumFee}
                  onChange={(event) => setMaximumFee(event.target.value)}
                />
              </Field>
              <div className="is-span-2">
                <label className="ws-dash-checkbox">
                  <input
                    type="checkbox"
                    checked={configIsActive}
                    onChange={(event) => setConfigIsActive(event.target.checked)}
                  />
                  Active
                </label>
              </div>
            </div>
            {configError ? (
              <p className="ws-dash-field-error">{configError}</p>
            ) : null}
          </AdminModal>

          <AdminModal
            open={zoneModalOpen}
            wide
            title={zoneEditing ? "Edit zone" : "New zone"}
            onClose={closeZoneModal}
            footer={
              <>
                <button
                  type="button"
                  className="ws-dash-btn is-ghost"
                  onClick={closeZoneModal}
                  disabled={zoneSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ws-dash-btn is-primary"
                  onClick={submitZone}
                  disabled={zoneSubmitting}
                >
                  {zoneSubmitting ? "Saving…" : "Save"}
                </button>
              </>
            }
          >
            <div className="ws-dash-form-grid">
              <Field label="Code">
                <input
                  className="ws-dash-input"
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </Field>
              <Field label="Name">
                <input
                  className="ws-dash-input"
                  type="text"
                  value={zoneName}
                  onChange={(event) => setZoneName(event.target.value)}
                />
              </Field>
              <Field label="City">
                <input
                  className="ws-dash-input"
                  type="text"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                />
              </Field>
              <Field label="Region">
                <input
                  className="ws-dash-input"
                  type="text"
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                />
              </Field>
              <Field label="Estimated distance (km)">
                <input
                  className="ws-dash-input"
                  type="number"
                  step="0.1"
                  value={estimatedDistanceKm}
                  onChange={(event) =>
                    setEstimatedDistanceKm(event.target.value)
                  }
                />
              </Field>
              <div className="is-span-2">
                <label className="ws-dash-checkbox">
                  <input
                    type="checkbox"
                    checked={zoneIsActive}
                    onChange={(event) => setZoneIsActive(event.target.checked)}
                  />
                  Active
                </label>
              </div>
            </div>
            {zoneError ? <p className="ws-dash-field-error">{zoneError}</p> : null}
          </AdminModal>

          <AdminModal
            open={surchargeModalOpen}
            wide
            title={surchargeEditing ? "Edit surcharge" : "New surcharge"}
            onClose={closeSurchargeModal}
            footer={
              <>
                <button
                  type="button"
                  className="ws-dash-btn is-ghost"
                  onClick={closeSurchargeModal}
                  disabled={surchargeSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ws-dash-btn is-primary"
                  onClick={submitSurcharge}
                  disabled={surchargeSubmitting}
                >
                  {surchargeSubmitting ? "Saving…" : "Save"}
                </button>
              </>
            }
          >
            <div className="ws-dash-form-grid">
              <Field label="Code">
                <input
                  className="ws-dash-input"
                  type="text"
                  value={surchargeCode}
                  onChange={(event) => setSurchargeCode(event.target.value)}
                />
              </Field>
              <Field label="Name">
                <input
                  className="ws-dash-input"
                  type="text"
                  value={surchargeName}
                  onChange={(event) => setSurchargeName(event.target.value)}
                />
              </Field>
              <Field label="Amount (GHS)">
                <input
                  className="ws-dash-input"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </Field>
              <Field label="Zone">
                <select
                  className="ws-dash-select"
                  value={zoneId}
                  onChange={(event) => setZoneId(event.target.value)}
                >
                  <option value="">All zones</option>
                  {zones.rows.map((zone) => (
                    <option key={zone.id} value={String(zone.id)}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="is-span-2">
                <label className="ws-dash-checkbox">
                  <input
                    type="checkbox"
                    checked={surchargeIsActive}
                    onChange={(event) =>
                      setSurchargeIsActive(event.target.checked)
                    }
                  />
                  Active
                </label>
              </div>
            </div>
            {surchargeError ? (
              <p className="ws-dash-field-error">{surchargeError}</p>
            ) : null}
          </AdminModal>
        </>
      )}
    </>
  );
}
