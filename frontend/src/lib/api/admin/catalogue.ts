import { adminFetch, adminGet, adminPatch, adminPost, buildQuery } from "./client";
import type { Brand, PaginatedResponse } from "@/types/api";
import type {
  AdminCategory,
  AdminHomepageSettings,
  AdminProduct,
  AdminPromotion,
  MediaUploadResult,
} from "@/types/admin";

// ─── Products ─────────────────────────────────────────────────────────────────

export interface AdminProductListParams {
  search?: string;
  publication_status?: string;
  product_type?: string;
  sales_method?: string;
  page_size?: number;
  page?: number;
}

export function listAdminProducts(
  params: AdminProductListParams = {},
): Promise<PaginatedResponse<AdminProduct>> {
  return adminGet<PaginatedResponse<AdminProduct>>(
    `/api/catalogue/staff/products/${buildQuery({ ...params })}`,
  );
}

export function getAdminProduct(id: number): Promise<AdminProduct> {
  return adminGet<AdminProduct>(`/api/catalogue/staff/products/${id}/`);
}

export function createAdminProduct(payload: unknown): Promise<AdminProduct> {
  return adminPost<AdminProduct>("/api/catalogue/staff/products/", payload);
}

export function updateAdminProduct(
  id: number,
  payload: unknown,
): Promise<AdminProduct> {
  return adminPatch<AdminProduct>(`/api/catalogue/staff/products/${id}/`, payload);
}

// ─── Categories ───────────────────────────────────────────────────────────────

export function listAdminCategories(params: {
  search?: string;
  product_type?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<PaginatedResponse<AdminCategory>> {
  return adminGet<PaginatedResponse<AdminCategory>>(
    `/api/catalogue/staff/categories/${buildQuery({ ...params })}`,
  );
}

export function createAdminCategory(payload: unknown): Promise<AdminCategory> {
  return adminPost<AdminCategory>("/api/catalogue/staff/categories/", payload);
}

export function updateAdminCategory(
  id: number,
  payload: unknown,
): Promise<AdminCategory> {
  return adminPatch<AdminCategory>(`/api/catalogue/staff/categories/${id}/`, payload);
}

// ─── Brands ───────────────────────────────────────────────────────────────────

export function listAdminBrands(params: {
  search?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<PaginatedResponse<Brand>> {
  return adminGet<PaginatedResponse<Brand>>(
    `/api/catalogue/staff/brands/${buildQuery({ ...params })}`,
  );
}

export function createAdminBrand(payload: unknown): Promise<Brand> {
  return adminPost<Brand>("/api/catalogue/staff/brands/", payload);
}

export function updateAdminBrand(id: number, payload: unknown): Promise<Brand> {
  return adminPatch<Brand>(`/api/catalogue/staff/brands/${id}/`, payload);
}

// ─── Promotions ───────────────────────────────────────────────────────────────

export function listAdminPromotions(params: {
  search?: string;
  page?: number;
} = {}): Promise<PaginatedResponse<AdminPromotion>> {
  return adminGet<PaginatedResponse<AdminPromotion>>(
    `/api/catalogue/staff/promotions/${buildQuery({ ...params })}`,
  );
}

export function createAdminPromotion(payload: unknown): Promise<AdminPromotion> {
  return adminPost<AdminPromotion>("/api/catalogue/staff/promotions/", payload);
}

export function updateAdminPromotion(
  id: number,
  payload: unknown,
): Promise<AdminPromotion> {
  return adminPatch<AdminPromotion>(
    `/api/catalogue/staff/promotions/${id}/`,
    payload,
  );
}

// ─── Homepage CMS ─────────────────────────────────────────────────────────────

export function getAdminHomepageSettings(): Promise<AdminHomepageSettings> {
  return adminGet<AdminHomepageSettings>("/api/catalogue/staff/homepage/");
}

export function updateAdminHomepageSettings(
  payload: unknown,
): Promise<AdminHomepageSettings> {
  return adminPatch<AdminHomepageSettings>(
    "/api/catalogue/staff/homepage/",
    payload,
  );
}

// ─── Media ────────────────────────────────────────────────────────────────────

export function uploadMedia(
  file: File,
  folder = "catalogue",
): Promise<MediaUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  return adminFetch<MediaUploadResult>("/api/catalogue/staff/media/", {
    method: "POST",
    formData,
  });
}
