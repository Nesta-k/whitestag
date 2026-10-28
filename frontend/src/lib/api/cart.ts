import { apiRequest } from "./client";
import type { Cart, CartItem } from "@/types/api";

export function getCart(): Promise<Cart> {
  return apiRequest("/cart/");
}

export function addCartItem(
  productId: number,
  quantity: number,
): Promise<CartItem> {
  return apiRequest("/cart/items/", {
    method: "POST",
    body: JSON.stringify({ product_id: productId, quantity }),
  });
}

export function updateCartItem(
  itemId: number,
  quantity: number,
): Promise<CartItem> {
  return apiRequest(`/cart/items/${itemId}/`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });
}

export function removeCartItem(itemId: number): Promise<void> {
  return apiRequest(`/cart/items/${itemId}/`, { method: "DELETE" });
}
