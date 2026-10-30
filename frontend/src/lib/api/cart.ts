import { apiFetch, apiPost, apiPatch, apiDelete } from "./client";
import type { Cart, CartItem } from "@/types/api";

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

