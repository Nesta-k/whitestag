import { apiRequest, idempotencyKey } from "./client";
import type {
  CheckoutDetails,
  DeliveryQuote,
  DeliveryZone,
  Order,
  PaginatedResponse,
  PaymentInitialization,
  PaymentVerification,
} from "@/types/api";

export function getDeliveryZones(): Promise<PaginatedResponse<DeliveryZone>> {
  return apiRequest("/orders/delivery-zones/?page_size=100");
}

export function getDeliveryQuote(
  destination: Pick<CheckoutDetails, "city" | "region" | "country">,
): Promise<DeliveryQuote> {
  return apiRequest("/orders/delivery-quote/", {
    method: "POST",
    body: JSON.stringify(destination),
  });
}

export function getOrders(page = 1): Promise<PaginatedResponse<Order>> {
  return apiRequest(`/orders/${page > 1 ? `?page=${page}` : ""}`);
}

export function getOrder(reference: string): Promise<Order> {
  return apiRequest(`/orders/${encodeURIComponent(reference)}/`);
}

export function initializeCheckout(
  details: CheckoutDetails,
  key = idempotencyKey(),
): Promise<Order> {
  return apiRequest("/orders/checkout/", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(details),
  });
}

export function cancelOrder(reference: string): Promise<Order> {
  return apiRequest(`/orders/${encodeURIComponent(reference)}/cancel/`, {
    method: "POST",
  });
}

export function initializePayment(
  orderReference: string,
  key = idempotencyKey(),
): Promise<PaymentInitialization> {
  return apiRequest(
    `/orders/${encodeURIComponent(orderReference)}/payments/`,
    {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({}),
    },
  );
}

export function verifyPayment(
  paymentReference: string,
): Promise<PaymentVerification> {
  return apiRequest(
    `/orders/payments/${encodeURIComponent(paymentReference)}/verify/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}
