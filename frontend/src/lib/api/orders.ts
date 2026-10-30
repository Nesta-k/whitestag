import { apiFetch, apiPost } from "./client";
import type {
  Order,
  CheckoutPayload,
  DeliveryZone,
  DeliveryQuote,
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
  delivery_zone_code: string;
  items: { product_id: number; quantity: number }[];
}): Promise<DeliveryQuote> {
  return apiPost<DeliveryQuote>("/api/orders/delivery-quote/", payload);
}

export function checkout(payload: CheckoutPayload): Promise<Order> {
  return apiPost<Order>("/api/orders/checkout/", payload);
}

export function initializePayment(orderReference: string): Promise<PaymentInit> {
  return apiPost<PaymentInit>(
    `/api/orders/${orderReference}/payments/`,
    {}
  );
}

export function verifyPayment(paymentReference: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(
    `/api/orders/payments/${paymentReference}/verify/`
  );
}

export function cancelOrder(reference: string): Promise<Order> {
  return apiPost<Order>(`/api/orders/${reference}/cancel/`, {});
}

