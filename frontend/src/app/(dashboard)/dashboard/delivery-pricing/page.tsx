"use client";

import { useEffect, useState, type FormEvent } from "react";
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
  createDeliverySpecialRule,
  createDeliveryZone,
  getStaffDeliveryPricing,
  getInternationalDeliverySettings,
  listAfricanDeliveryCountries,
  listDeliveryPricingAudit,
  listDeliveryQuoteRequests,
  listDeliverySpecialRules,
  listGhanaRegionalRates,
  listDeliverySurcharges,
  listDeliveryZones,
  updateDeliverySurcharge,
  updateAfricanDeliveryCountry,
  updateDeliveryQuoteRequest,
  updateDeliverySpecialRule,
  updateDeliveryZone,
  updateGhanaRegionalRate,
  updateInternationalDeliverySettings,
} from "@/lib/api/admin/orders";
import type {
  DeliveryPricingAuditEntry,
  DeliveryQuoteRequest,
  DeliverySpecialRule,
  GhanaRegionalRate,
  AfricanDeliveryCountry,
  InternationalDeliverySettings,
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

function RegionalRateRow({
  row,
  onSave,
}: {
  row: GhanaRegionalRate;
  onSave: (id: number, payload: Partial<GhanaRegionalRate>) => Promise<void>;
}) {
  const [version, setVersion] = useState(row.version);
  const [fee, setFee] = useState(row.flat_fee);
  const [ratePerKg, setRatePerKg] = useState(row.rate_per_kg);
  const [active, setActive] = useState(row.is_active);
  const [fallback, setFallback] = useState(row.allow_fallback);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave(row.id, {
        version,
        flat_fee: fee,
        rate_per_kg: ratePerKg,
        is_active: active,
        allow_fallback: fallback,
      });
    } catch (saveError) {
      setError(describeAdminError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>{row.region_name}</td>
      <td><input aria-label={`${row.region_name} rate version`} value={version} onChange={(event) => setVersion(event.target.value)} /></td>
      <td><input aria-label={`${row.region_name} flat fee`} type="number" min="0" step="0.01" value={fee} onChange={(event) => setFee(event.target.value)} /></td>
      <td><input aria-label={`${row.region_name} per kg rate`} type="number" min="0" step="0.0001" value={ratePerKg} onChange={(event) => setRatePerKg(event.target.value)} /></td>
      <td><input aria-label={`${row.region_name} active`} type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /></td>
      <td><input aria-label={`${row.region_name} allow fallback`} type="checkbox" checked={fallback} onChange={(event) => setFallback(event.target.checked)} /></td>
      <td>
        <button type="button" className="ws-dash-btn is-small" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </button>
        {error && <span className="ws-dash-field-error">{error}</span>}
      </td>
    </tr>
  );
}

function QuoteRequestRow({
  row,
  onSave,
}: {
  row: DeliveryQuoteRequest;
  onSave: (
    reference: string,
    payload: Pick<DeliveryQuoteRequest, "status" | "quoted_fee" | "admin_note">,
  ) => Promise<void>;
}) {
  const [statusValue, setStatusValue] = useState(row.status);
  const [fee, setFee] = useState(row.quoted_fee ?? "");
  const [note, setNote] = useState(row.admin_note);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave(row.reference, {
        status: statusValue,
        quoted_fee: fee || null,
        admin_note: note,
      });
    } catch (saveError) {
      setError(describeAdminError(saveError));
    } finally {
      setSaving(false);
    }
  }
  return (
    <tr>
      <td>{row.reference.slice(0, 8)}</td>
      <td>{row.full_name}<br />{row.email}</td>
      <td>{row.city}, {row.region || row.country}<br />{row.address_line_1}</td>
      <td>{row.items_snapshot.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</td>
      <td>
        <select aria-label="Quotation status" value={statusValue} onChange={(event) => setStatusValue(event.target.value as DeliveryQuoteRequest["status"])}>
          {["pending", "in_progress", "quoted", "accepted", "declined", "cancelled"].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
        </select>
        <input aria-label="Quoted delivery fee" type="number" min="0" step="0.01" placeholder="GHS fee" value={fee} onChange={(event) => setFee(event.target.value)} />
        <input aria-label="Admin note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Customer-facing note" />
      </td>
      <td><button type="button" className="ws-dash-btn is-small" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>{error && <span className="ws-dash-field-error">{error}</span>}</td>
    </tr>
  );
}

function SpecialRuleRow({
  row,
  onSave,
}: {
  row: DeliverySpecialRule;
  onSave: (id: number, payload: Partial<DeliverySpecialRule>) => Promise<void>;
}) {
  const [name, setName] = useState(row.name);
  const [productType, setProductType] = useState(row.product_type);
  const [nameMatch, setNameMatch] = useState(row.product_name_contains);
  const [weight, setWeight] = useState(row.minimum_product_weight_kg ?? "");
  const [surcharge, setSurcharge] = useState(row.surcharge_amount);
  const [manual, setManual] = useState(row.requires_manual_review);
  const [active, setActive] = useState(row.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave(row.id, {
        name,
        product_type: productType,
        product_name_contains: nameMatch,
        minimum_product_weight_kg: weight || null,
        surcharge_amount: surcharge,
        requires_manual_review: manual,
        is_active: active,
      });
    } catch (saveError) {
      setError(describeAdminError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ws-dash-form-grid">
      <label>{row.code}
        <input aria-label={`${row.name} rule name`} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>Product type
        <select aria-label={`${row.name} product type`} value={productType} onChange={(event) => setProductType(event.target.value)}>
          <option value="">Any type</option>
          {["spare_part", "car", "electric_vehicle", "tricycle", "motorcycle_bike", "other"].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
        </select>
        <input aria-label={`${row.name} name match`} value={nameMatch} onChange={(event) => setNameMatch(event.target.value)} placeholder="Name contains" />
      </label>
      <label>Min weight (kg)<input aria-label={`${row.name} minimum weight`} type="number" min="0.001" step="0.001" value={weight} onChange={(event) => setWeight(event.target.value)} /></label>
      <label>Surcharge (GHS)<input aria-label={`${row.name} surcharge`} type="number" min="0" step="0.01" value={surcharge} onChange={(event) => setSurcharge(event.target.value)} /></label>
      <div>
        <label><input aria-label={`${row.name} manual review`} type="checkbox" checked={manual} onChange={(event) => setManual(event.target.checked)} /> Review</label>
        <label><input aria-label={`${row.name} active`} type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active</label>
        <button type="button" className="ws-dash-btn is-small" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
        {error && <span className="ws-dash-field-error">{error}</span>}
      </div>
    </div>
  );
}

export default function DeliveryPricingPage() {
  const { role } = useStaffAuth();
  const canConfigure = can(role, "delivery.configure");

  const summary = useAdminResource(() => getStaffDeliveryPricing());

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
  const regions = useAdminList(
    (page) => canConfigure ? listGhanaRegionalRates({ page }) : emptyPage<GhanaRegionalRate>(),
    String(canConfigure),
  );
  const countries = useAdminList(
    (page) => canConfigure ? listAfricanDeliveryCountries({ page }) : emptyPage<AfricanDeliveryCountry>(),
    String(canConfigure),
  );
  const specialRules = useAdminList(
    (page) => canConfigure ? listDeliverySpecialRules({ page }) : emptyPage<DeliverySpecialRule>(),
    String(canConfigure),
  );
  const quoteRequests = useAdminList(
    (page) => canConfigure ? listDeliveryQuoteRequests({ page }) : emptyPage<DeliveryQuoteRequest>(),
    String(canConfigure),
  );
  const international = useAdminResource(
    () => canConfigure
      ? getInternationalDeliverySettings()
      : Promise.resolve<InternationalDeliverySettings>({
          manual_quotes_enabled: false,
          instructions: "",
          updated_at: "",
        }),
    [canConfigure],
  );

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
  const [internationalEnabled, setInternationalEnabled] = useState(false);
  const [internationalInstructions, setInternationalInstructions] = useState("");
  const [internationalSaving, setInternationalSaving] = useState(false);
  const [internationalError, setInternationalError] = useState("");
  const [ruleCode, setRuleCode] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [ruleProductType, setRuleProductType] = useState("");
  const [ruleNameMatch, setRuleNameMatch] = useState("");
  const [ruleMinWeight, setRuleMinWeight] = useState("");
  const [ruleSurcharge, setRuleSurcharge] = useState("0");
  const [ruleManualReview, setRuleManualReview] = useState(true);
  const [ruleError, setRuleError] = useState("");
  const [ruleSaving, setRuleSaving] = useState(false);
  const [countryError, setCountryError] = useState("");

  useEffect(() => {
    if (international.data) {
      setInternationalEnabled(international.data.manual_quotes_enabled);
      setInternationalInstructions(international.data.instructions);
    }
  }, [international.data]);

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

  async function saveRegionalRate(id: number, payload: Partial<GhanaRegionalRate>) {
    await updateGhanaRegionalRate(id, payload);
    regions.reload();
    summary.reload();
  }

  async function toggleCountry(country: AfricanDeliveryCountry) {
    setCountryError("");
    try {
      await updateAfricanDeliveryCountry(country.id, {
        is_active: !country.is_active,
      });
      countries.reload();
    } catch (error) {
      setCountryError(describeAdminError(error));
    }
  }

  async function saveSpecialRule(id: number, payload: Partial<DeliverySpecialRule>) {
    await updateDeliverySpecialRule(id, payload);
    specialRules.reload();
  }

  async function submitSpecialRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRuleError("");
    setRuleSaving(true);
    try {
      await createDeliverySpecialRule({
        code: ruleCode.trim(),
        name: ruleName.trim(),
        product_type: ruleProductType,
        product_name_contains: ruleNameMatch.trim(),
        minimum_product_weight_kg: ruleMinWeight || null,
        surcharge_amount: ruleSurcharge,
        requires_manual_review: ruleManualReview,
        is_active: true,
      });
      setRuleCode("");
      setRuleName("");
      setRuleProductType("");
      setRuleNameMatch("");
      setRuleMinWeight("");
      setRuleSurcharge("0");
      setRuleManualReview(true);
      specialRules.reload();
    } catch (error) {
      setRuleError(describeAdminError(error));
    } finally {
      setRuleSaving(false);
    }
  }

  async function saveInternationalSettings() {
    setInternationalError("");
    setInternationalSaving(true);
    try {
      await updateInternationalDeliverySettings({
        manual_quotes_enabled: internationalEnabled,
        instructions: internationalInstructions.trim(),
      });
      international.reload();
    } catch (error) {
      setInternationalError(describeAdminError(error));
    } finally {
      setInternationalSaving(false);
    }
  }

  async function saveQuoteRequest(
    reference: string,
    payload: Pick<DeliveryQuoteRequest, "status" | "quoted_fee" | "admin_note">,
  ) {
    await updateDeliveryQuoteRequest(reference, payload);
    quoteRequests.reload();
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
              <h2 className="ws-dash-panel-title">Ghana regional rates</h2>
            </div>
            <div className="ws-dash-panel-body">
              {regions.loading ? <AdminLoading /> : regions.error ? (
                <AdminError message={regions.error} onRetry={regions.reload} />
              ) : (
                <div className="ws-dash-table-wrap">
                  <table className="ws-dash-table">
                    <thead><tr><th>Region</th><th>Rate version</th><th>Flat fee (GHS)</th><th>Per kg (GHS)</th><th>Enabled</th><th>Fallback when disabled</th><th>Action</th></tr></thead>
                    <tbody>
                      {regions.rows.map((row) => (
                        <RegionalRateRow key={row.id} row={row} onSave={saveRegionalRate} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <AdminPagination page={regions.page} totalPages={regions.totalPages} count={regions.count} onPageChange={regions.setPage} noun="regions" />
              <p className="ws-dash-note">Starter fees are configurable estimates, not guaranteed courier prices. Each regional rate replaces the fallback distance formula.</p>
            </div>
          </div>

          <div className="ws-dash-panel">
            <div className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">International delivery</h2>
            </div>
            <div className="ws-dash-panel-body">
              {international.loading ? <AdminLoading /> : international.error ? (
                <AdminError message={international.error} onRetry={international.reload} />
              ) : (
                <>
                  <label className="ws-dash-field">
                    <span className="ws-dash-field-label">Accept manual quotations</span>
                    <input type="checkbox" checked={internationalEnabled} onChange={(event) => setInternationalEnabled(event.target.checked)} />
                  </label>
                  <label className="ws-dash-field">
                    <span className="ws-dash-field-label">Customer instructions</span>
                    <textarea className="ws-dash-input" maxLength={500} value={internationalInstructions} onChange={(event) => setInternationalInstructions(event.target.value)} />
                  </label>
                  {internationalError && <p className="ws-dash-field-error">{internationalError}</p>}
                  <button type="button" className="ws-dash-btn is-primary" disabled={internationalSaving} onClick={() => void saveInternationalSettings()}>
                    {internationalSaving ? "Saving…" : "Save international settings"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="ws-dash-panel">
            <div className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">African destination countries</h2>
            </div>
            <div className="ws-dash-panel-body">
              {countryError && <p className="ws-dash-field-error">{countryError}</p>}
              <AdminTable<AfricanDeliveryCountry>
                columns={[
                  { key: "code", header: "Code", render: (row) => row.country_code },
                  { key: "name", header: "Country", render: (row) => row.country_name },
                  { key: "active", header: "Enabled", render: (row) => <StatusBadge label={row.is_active ? "Enabled" : "Disabled"} tone={row.is_active ? "success" : "neutral"} /> },
                  { key: "action", header: "Action", render: (row) => <button type="button" className="ws-dash-btn is-small" onClick={() => void toggleCountry(row)}>{row.is_active ? "Disable" : "Enable"}</button> },
                ]}
                rows={countries.rows}
                rowKey={(row) => row.id}
                loading={countries.loading}
                error={countries.error}
                emptyMessage="No African destinations configured."
                onRetry={countries.reload}
              />
              <AdminPagination page={countries.page} totalPages={countries.totalPages} count={countries.count} onPageChange={countries.setPage} noun="countries" />
              <p className="ws-dash-note">All international destinations use manual quotations; no domestic Ghana rate is applied.</p>
            </div>
          </div>

          <div className="ws-dash-panel">
            <div className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Special delivery rules</h2>
            </div>
            <div className="ws-dash-panel-body">
              <form className="ws-dash-form-grid" onSubmit={(event) => void submitSpecialRule(event)}>
                <Field label="Rule code"><input className="ws-dash-input" required value={ruleCode} onChange={(event) => setRuleCode(event.target.value)} /></Field>
                <Field label="Rule name"><input className="ws-dash-input" required value={ruleName} onChange={(event) => setRuleName(event.target.value)} /></Field>
                <Field label="Product type">
                  <select className="ws-dash-select" value={ruleProductType} onChange={(event) => setRuleProductType(event.target.value)}>
                    <option value="">Any type</option>
                    {["spare_part", "car", "electric_vehicle", "tricycle", "motorcycle_bike", "other"].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
                  </select>
                </Field>
                <Field label="Product name contains"><input className="ws-dash-input" value={ruleNameMatch} onChange={(event) => setRuleNameMatch(event.target.value)} /></Field>
                <Field label="Minimum product weight (kg)"><input className="ws-dash-input" type="number" min="0.001" step="0.001" value={ruleMinWeight} onChange={(event) => setRuleMinWeight(event.target.value)} /></Field>
                <Field label="Additional charge (GHS)"><input className="ws-dash-input" type="number" min="0" step="0.01" value={ruleSurcharge} onChange={(event) => setRuleSurcharge(event.target.value)} /></Field>
                <label className="ws-dash-field"><span className="ws-dash-field-label">Require manual review</span><input type="checkbox" checked={ruleManualReview} onChange={(event) => setRuleManualReview(event.target.checked)} /></label>
                <div>
                  <button type="submit" className="ws-dash-btn is-primary" disabled={ruleSaving}>{ruleSaving ? "Creating…" : "Create rule"}</button>
                  {ruleError && <p className="ws-dash-field-error">{ruleError}</p>}
                </div>
              </form>
              <AdminTable<DeliverySpecialRule>
                columns={[
                  { key: "code", header: "Code", render: (row) => row.code },
                  { key: "name", header: "Name", render: (row) => row.name },
                  { key: "match", header: "Match conditions", render: (row) => [row.product_type && humanize(row.product_type), row.product_name_contains && `Name contains “${row.product_name_contains}”`, row.minimum_product_weight_kg && `At least ${row.minimum_product_weight_kg} kg`].filter(Boolean).join(" · ") },
                  { key: "fee", header: "Surcharge", render: (row) => money(row.surcharge_amount) },
                  { key: "review", header: "Manual review", render: (row) => row.requires_manual_review ? "Required" : "No" },
                  { key: "active", header: "Active", render: (row) => <StatusBadge label={row.is_active ? "Active" : "Inactive"} tone={row.is_active ? "success" : "neutral"} /> },
                  { key: "actions", header: "Edit rule", render: (row) => <SpecialRuleRow row={row} onSave={saveSpecialRule} /> },
                ]}
                rows={specialRules.rows}
                rowKey={(row) => row.id}
                loading={specialRules.loading}
                error={specialRules.error}
                emptyMessage="No special delivery rules configured."
                onRetry={specialRules.reload}
              />
              <AdminPagination page={specialRules.page} totalPages={specialRules.totalPages} count={specialRules.count} onPageChange={specialRules.setPage} noun="rules" />
            </div>
          </div>

          <div className="ws-dash-panel">
            <div className="ws-dash-panel-head">
              <h2 className="ws-dash-panel-title">Manual delivery quotation requests</h2>
            </div>
            <div className="ws-dash-panel-body">
              {quoteRequests.loading ? <AdminLoading /> : quoteRequests.error ? (
                <AdminError message={quoteRequests.error} onRetry={quoteRequests.reload} />
              ) : (
                <div className="ws-dash-table-wrap">
                  <table className="ws-dash-table">
                    <thead><tr><th>Reference</th><th>Customer</th><th>Destination</th><th>Items</th><th>Review / quotation</th><th>Action</th></tr></thead>
                    <tbody>
                      {quoteRequests.rows.map((row) => <QuoteRequestRow key={row.reference} row={row} onSave={saveQuoteRequest} />)}
                    </tbody>
                  </table>
                  {!quoteRequests.rows.length && <AdminEmpty message="No manual delivery requests." />}
                </div>
              )}
              <AdminPagination page={quoteRequests.page} totalPages={quoteRequests.totalPages} count={quoteRequests.count} onPageChange={quoteRequests.setPage} noun="requests" />
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
