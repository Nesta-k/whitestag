import { apiRequest, queryString } from "./client";
import type {
  Brand,
  Category,
  PaginatedResponse,
  Product,
} from "@/types/api";

export function getCategories(): Promise<PaginatedResponse<Category>> {
  return apiRequest("/catalogue/categories/?page_size=100");
}

export function getBrands(): Promise<PaginatedResponse<Brand>> {
  return apiRequest("/catalogue/brands/?page_size=100");
}

export function getProducts(filters: {
  category?: string;
  brand?: string;
  product_type?: string;
  sales_method?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<PaginatedResponse<Product>> {
  return apiRequest(
    `/catalogue/products/${queryString(filters)}`,
  );
}

export async function getAllProducts(
  filters: Omit<Parameters<typeof getProducts>[0], "page" | "page_size"> = {},
): Promise<Product[]> {
  const firstPage = await getProducts({ ...filters, page: 1, page_size: 100 });
  const pages = firstPage.results.length
    ? Math.ceil(firstPage.count / firstPage.results.length)
    : 0;
  const products = [...firstPage.results];
  for (let page = 2; page <= pages; page += 1) {
    const response = await getProducts({ ...filters, page, page_size: 100 });
    products.push(...response.results);
  }
  return products;
}

export function getProduct(slug: string): Promise<Product> {
  return apiRequest(`/catalogue/products/${encodeURIComponent(slug)}/`);
}

export function getCategory(slug: string): Promise<Category | undefined> {
  return getCategories().then((response) =>
    response.results.find((category) => category.slug === slug),
  );
}
