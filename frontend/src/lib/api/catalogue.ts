import { apiFetch } from "./client";
import type {
  Brand,
  Category,
  HomepageData,
  PaginatedResponse,
  Product,
  Promotion,
} from "@/types/api";

export function getHomepage(): Promise<HomepageData> {
  return apiFetch<HomepageData>("/api/catalogue/homepage/");
}

export function getProducts(params?: {
  search?: string;
  category?: string;
  brand?: string;
  product_type?: string;
  sales_method?: string;
  page?: number;
}): Promise<PaginatedResponse<Product>> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.category) qs.set("category", params.category);
  if (params?.brand) qs.set("brand", params.brand);
  if (params?.product_type) qs.set("product_type", params.product_type);
  if (params?.sales_method) qs.set("sales_method", params.sales_method);
  if (params?.page) qs.set("page", String(params.page));
  const query = qs.toString();
  return apiFetch<PaginatedResponse<Product>>(
    `/api/catalogue/products/${query ? `?${query}` : ""}`
  );
}

export function getProduct(slug: string): Promise<Product> {
  return apiFetch<Product>(`/api/catalogue/products/${encodeURIComponent(slug)}/`);
}

export function getCategories(params?: {
  product_type?: string;
}): Promise<PaginatedResponse<Category>> {
  const qs = new URLSearchParams();
  if (params?.product_type) qs.set("product_type", params.product_type);
  const query = qs.toString();
  return apiFetch<PaginatedResponse<Category>>(
    `/api/catalogue/categories/${query ? `?${query}` : ""}`
  );
}

export function getBrands(): Promise<PaginatedResponse<Brand>> {
  return apiFetch<PaginatedResponse<Brand>>("/api/catalogue/brands/");
}

export function getPromotions(): Promise<PaginatedResponse<Promotion>> {
  return apiFetch<PaginatedResponse<Promotion>>("/api/catalogue/promotions/");
}
