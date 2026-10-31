import { apiFetch, apiPost } from "./client";
import type {
  Order,
  CheckoutPayload,
  DeliveryZone,
  DeliveryQuote,
  DeliveryOptions,
  DeliveryQuoteRequestResult,
  PaymentInit,
  PaginatedResponse,
} from "@/types/api";

export function getOrders(): Promise<PaginatedResponse<Order>> {
  return apiFetch<PaginatedResponse<Order>>("/api/orders/");
}

export function getOrder(reference: string): Promise<Order> {
  return apiFetch<Order>(`/api/orders/${reference}/`);
}

export function getDeliveryZones(): Promise<PaginatedResponse<DeliveryZone>> {
  return apiFetch<PaginatedResponse<DeliveryZone>>("/api/orders/delivery-zones/");
}

export function getDeliveryQuote(payload: {
  city: string;
  region: string;
  country: string;
}): Promise<DeliveryQuote> {
  return apiPost<DeliveryQuote>("/api/orders/delivery-quote/", payload);
}

export function getDeliveryOptions(): Promise<DeliveryOptions> {
  return apiFetch<DeliveryOptions>("/api/orders/delivery-options/");
}

export function createDeliveryQuoteRequest(
  payload: CheckoutPayload & { idempotency_key: string },
): Promise<DeliveryQuoteRequestResult> {
  return apiPost<DeliveryQuoteRequestResult>(
    "/api/orders/delivery-quote-requests/",
    payload,
  );
}

export function checkout(
  payload: CheckoutPayload,
  idempotencyKey: string,
): Promise<Order> {
  return apiFetch<Order>("/api/orders/checkout/", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
  });
}

export function initializePayment(
  orderReference: string,
  idempotencyKey: string,
): Promise<PaymentInit> {
  return apiFetch<PaymentInit>(`/api/orders/${orderReference}/payments/`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({}),
  });
}

export function verifyPayment(
  paymentReference: string,
): Promise<{ reference: string; status: string; outcome: string }> {
  return apiFetch<{ reference: string; status: string; outcome: string }>(
    `/api/orders/payments/${encodeURIComponent(paymentReference)}/verify/`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function cancelOrder(reference: string): Promise<Order> {
  return apiPost<Order>(`/api/orders/${reference}/cancel/`, {});
}

export function createIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
