import { ApiError, apiDelete, apiFetch, apiPatch, apiPost } from "./client";
import type { Cart, CartItem } from "@/types/api";

export function describeCartActionError(error: unknown): string {
  if (error instanceof ApiError) {
    const data =
      error.data && typeof error.data === "object"
        ? (error.data as Record<string, unknown>)
        : null;
    const detail = data
      ? Object.values(data).find((value) => value !== undefined)
      : undefined;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail) && typeof detail[0] === "string"
          ? detail[0]
          : undefined;

    if (error.status === 409) {
      if (message?.toLowerCase().includes("currently unavailable")) {
        return "This item is out of stock. Please contact our team for availability.";
      }
      return "There isn’t enough stock available for this item right now.";
    }
    if (message) return message;
  }

  return error instanceof Error
    ? error.message
    : "We could not add this item. Please try again.";
}

export function getCart(): Promise<Cart> {
  return apiFetch<Cart>("/api/cart/");
}

export function addToCart(payload: {
  product_id: number;
  quantity: number;
}): Promise<CartItem> {
  return apiPost<CartItem>("/api/cart/items/", payload);
}

export function updateCartItem(
  itemId: number,
  quantity: number
): Promise<CartItem> {
  return apiPatch<CartItem>(`/api/cart/items/${itemId}/`, { quantity });
}

export function removeCartItem(itemId: number): Promise<void> {
  return apiDelete(`/api/cart/items/${itemId}/`);
}
