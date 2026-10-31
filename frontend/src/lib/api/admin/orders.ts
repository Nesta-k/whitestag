import { adminFetch, adminGet, adminPatch, adminPost, buildQuery, newIdempotencyKey } from "./client";
import type { Order, PaginatedResponse } from "@/types/api";
import type {
  DashboardOverview,
  DeliveryPricingAuditEntry,
  DeliveryPricingConfiguration,
  DeliveryQuoteRequest,
  DeliverySpecialRule,
  GhanaRegionalRate,
  AfricanDeliveryCountry,
  InternationalDeliverySettings,
  PaymentRefundResult,
  StaffDeliveryPricing,
  StaffDeliverySurcharge,
  StaffDeliveryZone,
  StaffPayment,
} from "@/types/admin";

// ─── Overview ─────────────────────────────────────────────────────────────────

export function getDashboardOverview(): Promise<DashboardOverview> {
  return adminGet<DashboardOverview>("/api/orders/staff/dashboard/");
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export function listStaffOrders(params: { page?: number } = {}): Promise<
  PaginatedResponse<Order>
> {
  return adminGet<PaginatedResponse<Order>>(
    `/api/orders/staff/${buildQuery({ ...params })}`,
  );
}

export function completeStaffOrder(publicReference: string): Promise<Order> {
  return adminPost<Order>(`/api/orders/staff/${publicReference}/complete/`);
}

// ─── Payments & refunds ───────────────────────────────────────────────────────

export function listStaffPayments(params: {
  status?: string;
  search?: string;
  page?: number;
} = {}): Promise<PaginatedResponse<StaffPayment>> {
  return adminGet<PaginatedResponse<StaffPayment>>(
    `/api/orders/staff/payments/${buildQuery({ ...params })}`,
  );
}

/** Admin/Superadmin only — the backend gates this with IsAdminOrSuperadmin. */
export function refundPayment(
  paymentReference: string,
): Promise<PaymentRefundResult> {
  return adminFetch<PaymentRefundResult>(
    `/api/orders/staff/payments/${paymentReference}/refunds/`,
    {
      method: "POST",
      body: {},
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}

// ─── Delivery pricing (staff read view) ───────────────────────────────────────

export function getStaffDeliveryPricing(): Promise<StaffDeliveryPricing> {
  return adminGet<StaffDeliveryPricing>("/api/orders/staff/delivery-pricing/");
}

// ─── Delivery pricing configuration (admin/superadmin) ────────────────────────

const PRICING_BASE = "/api/orders/superadmin/delivery-pricing";

export function listPricingConfigurations(params: { page?: number } = {}): Promise<
  PaginatedResponse<DeliveryPricingConfiguration>
> {
  return adminGet<PaginatedResponse<DeliveryPricingConfiguration>>(
    `${PRICING_BASE}/configurations/${buildQuery({ ...params })}`,
  );
}

export function createPricingConfiguration(
  payload: unknown,
): Promise<DeliveryPricingConfiguration> {
  return adminPost<DeliveryPricingConfiguration>(
    `${PRICING_BASE}/configurations/`,
    payload,
  );
}

export function updatePricingConfiguration(
  id: number,
  payload: unknown,
): Promise<DeliveryPricingConfiguration> {
  return adminPatch<DeliveryPricingConfiguration>(
    `${PRICING_BASE}/configurations/${id}/`,
    payload,
  );
}

export function listDeliveryZones(params: { page?: number } = {}): Promise<
  PaginatedResponse<StaffDeliveryZone>
> {
  return adminGet<PaginatedResponse<StaffDeliveryZone>>(
    `${PRICING_BASE}/zones/${buildQuery({ ...params })}`,
  );
}

export function createDeliveryZone(payload: unknown): Promise<StaffDeliveryZone> {
  return adminPost<StaffDeliveryZone>(`${PRICING_BASE}/zones/`, payload);
}

export function updateDeliveryZone(
  id: number,
  payload: unknown,
): Promise<StaffDeliveryZone> {
  return adminPatch<StaffDeliveryZone>(`${PRICING_BASE}/zones/${id}/`, payload);
}

export function listDeliverySurcharges(params: { page?: number } = {}): Promise<
  PaginatedResponse<StaffDeliverySurcharge>
> {
  return adminGet<PaginatedResponse<StaffDeliverySurcharge>>(
    `${PRICING_BASE}/surcharges/${buildQuery({ ...params })}`,
  );
}

export function createDeliverySurcharge(
  payload: unknown,
): Promise<StaffDeliverySurcharge> {
  return adminPost<StaffDeliverySurcharge>(`${PRICING_BASE}/surcharges/`, payload);
}

export function updateDeliverySurcharge(
  id: number,
  payload: unknown,
): Promise<StaffDeliverySurcharge> {
  return adminPatch<StaffDeliverySurcharge>(
    `${PRICING_BASE}/surcharges/${id}/`,
    payload,
  );
}

export function listDeliveryPricingAudit(params: { page?: number } = {}): Promise<
  PaginatedResponse<DeliveryPricingAuditEntry>
> {
  return adminGet<PaginatedResponse<DeliveryPricingAuditEntry>>(
    `${PRICING_BASE}/audit/${buildQuery({ ...params })}`,
  );
}

export function listGhanaRegionalRates(params: { page?: number } = {}): Promise<
  PaginatedResponse<GhanaRegionalRate>
> {
  return adminGet<PaginatedResponse<GhanaRegionalRate>>(
    `${PRICING_BASE}/regions/${buildQuery({ ...params })}`,
  );
}

export function updateGhanaRegionalRate(
  id: number,
  payload: Partial<Pick<GhanaRegionalRate, "version" | "flat_fee" | "rate_per_kg" | "is_active" | "allow_fallback">>,
): Promise<GhanaRegionalRate> {
  return adminPatch<GhanaRegionalRate>(`${PRICING_BASE}/regions/${id}/`, payload);
}

export function listAfricanDeliveryCountries(params: { page?: number } = {}): Promise<
  PaginatedResponse<AfricanDeliveryCountry>
> {
  return adminGet<PaginatedResponse<AfricanDeliveryCountry>>(
    `${PRICING_BASE}/countries/${buildQuery({ ...params })}`,
  );
}

export function updateAfricanDeliveryCountry(
  id: number,
  payload: { is_active: boolean },
): Promise<AfricanDeliveryCountry> {
  return adminPatch<AfricanDeliveryCountry>(
    `${PRICING_BASE}/countries/${id}/`,
    payload,
  );
}

export function listDeliverySpecialRules(params: { page?: number } = {}): Promise<
  PaginatedResponse<DeliverySpecialRule>
> {
  return adminGet<PaginatedResponse<DeliverySpecialRule>>(
    `${PRICING_BASE}/special-rules/${buildQuery({ ...params })}`,
  );
}

export function createDeliverySpecialRule(
  payload: Partial<DeliverySpecialRule>,
): Promise<DeliverySpecialRule> {
  return adminPost<DeliverySpecialRule>(`${PRICING_BASE}/special-rules/`, payload);
}

export function updateDeliverySpecialRule(
  id: number,
  payload: Partial<DeliverySpecialRule>,
): Promise<DeliverySpecialRule> {
  return adminPatch<DeliverySpecialRule>(
    `${PRICING_BASE}/special-rules/${id}/`,
    payload,
  );
}

export function getInternationalDeliverySettings(): Promise<InternationalDeliverySettings> {
  return adminGet<InternationalDeliverySettings>(
    `${PRICING_BASE}/international-settings/`,
  );
}

export function updateInternationalDeliverySettings(
  payload: Pick<InternationalDeliverySettings, "manual_quotes_enabled" | "instructions">,
): Promise<InternationalDeliverySettings> {
  return adminPatch<InternationalDeliverySettings>(
    `${PRICING_BASE}/international-settings/`,
    payload,
  );
}

export function listDeliveryQuoteRequests(params: {
  page?: number;
  status?: string;
} = {}): Promise<PaginatedResponse<DeliveryQuoteRequest>> {
  return adminGet<PaginatedResponse<DeliveryQuoteRequest>>(
    `${PRICING_BASE}/quote-requests/${buildQuery({ ...params })}`,
  );
}

export function updateDeliveryQuoteRequest(
  reference: string,
  payload: Pick<DeliveryQuoteRequest, "status" | "quoted_fee" | "admin_note">,
): Promise<DeliveryQuoteRequest> {
  return adminPatch<DeliveryQuoteRequest>(
    `${PRICING_BASE}/quote-requests/${reference}/`,
    payload,
  );
}
