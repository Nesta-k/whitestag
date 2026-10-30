import Link from "next/link";
import type { Metadata } from "next";
import ProductCard from "@/components/catalogue/product-card";
import { getCategories, getProducts } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";
import type { Category } from "@/types/api";

export const metadata: Metadata = {
  title: "Shop parts and vehicles | WhiteStag",
  description: "Browse the WhiteStag catalogue of parts and vehicles.",
};

type SearchParams = {
  category?: string;
  brand?: string;
  product_type?: string;
  sales_method?: string;
  page?: string;
};

const productTypes = [
  ["spare_part", "Spare parts"],
  ["car", "Cars"],
  ["electric_vehicle", "Electric vehicles"],
  ["tricycle", "Tricycles"],
  ["motorcycle_bike", "Motorcycles & bikes"],
  ["other", "Other"],
] as const;

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    return `The catalogue service returned an error (${error.status}).`;
  }
  return error instanceof Error
    ? `We could not reach the catalogue: ${error.message}`
    : "We could not load the catalogue. Please try again shortly.";
}

function pageHref(params: SearchParams, page: number): string {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.brand) query.set("brand", params.brand);
  if (params.product_type) query.set("product_type", params.product_type);
  if (params.sales_method) query.set("sales_method", params.sales_method);
  query.set("page", String(page));
  return `/products?${query.toString()}`;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  let products;
  let categories: Category[] = [];
  let loadError = "";

  try {
    const [productResponse, categoryResponse] = await Promise.all([
      getProducts({
        category: params.category,
        brand: params.brand,
        product_type: params.product_type,
        sales_method: params.sales_method,
        page,
      }),
      getCategories(),
    ]);
    products = productResponse;
    categories = categoryResponse.results;
  } catch (error) {
    loadError = errorText(error);
  }

  return (
    <section className="catalogue-page">
      <div className="catalogue-heading">
        <p className="eyebrow">THE WHITESTAG CATALOGUE</p>
        <h1>Find what moves you.</h1>
        <p>Browse parts, vehicles, and equipment selected to keep you going.</p>
      </div>

      <form className="catalogue-filters" action="/products">
        <label>
          <span>Category</span>
          <select name="category" defaultValue={params.category ?? ""}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Product type</span>
          <select
            name="product_type"
            defaultValue={params.product_type ?? ""}
          >
            <option value="">Everything</option>
            {productTypes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Buying option</span>
          <select
            name="sales_method"
            defaultValue={params.sales_method ?? ""}
          >
            <option value="">All options</option>
            <option value="direct_purchase">Ready to buy</option>
            <option value="quotation">Request a quote</option>
          </select>
        </label>
        <button className="filter-submit" type="submit">
          Apply filters
        </button>
        {(params.category ||
          params.brand ||
          params.product_type ||
          params.sales_method) && (
          <Link className="filter-reset" href="/products">
            Clear
          </Link>
        )}
      </form>

      {loadError ? (
        <div className="catalogue-message" role="alert">
          <h2>Catalogue unavailable</h2>
          <p>{loadError}</p>
          <p>Check that the Django API is running and try again.</p>
        </div>
      ) : products?.results.length ? (
        <>
          <p className="catalogue-count">
            {products.count} {products.count === 1 ? "item" : "items"}
          </p>
          <div className="product-grid">
            {products.results.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <nav className="pagination" aria-label="Catalogue pages">
            {products.previous ? (
              <Link href={pageHref(params, page - 1)}>← Previous</Link>
            ) : (
              <span />
            )}
            <span>Page {page}</span>
            {products.next ? (
              <Link href={pageHref(params, page + 1)}>Next →</Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      ) : (
        !loadError && (
          <div className="catalogue-message">
            <h2>No matching items</h2>
            <p>Try changing your filters to see more of the catalogue.</p>
            <Link className="text-link" href="/products">
              View all products
            </Link>
          </div>
        )
      )}
    </section>
  );
}
