import { apiFetch, apiPost, apiDelete } from "./client";
import type { PaginatedResponse, WishlistItem } from "@/types/api";

export function getWishlist(): Promise<PaginatedResponse<WishlistItem>> {
  return apiFetch<PaginatedResponse<WishlistItem>>("/api/wishlist/");
}

export function addWishlistItem(productId: number): Promise<WishlistItem> {
  return apiPost<WishlistItem>("/api/wishlist/", { product_id: productId });
}

export function removeWishlistItem(itemId: number): Promise<void> {
  return apiDelete(`/api/wishlist/${itemId}/`);
}
