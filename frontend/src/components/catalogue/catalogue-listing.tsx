import Link from "next/link";
import ProductCard from "@/components/catalogue/product-card";
import { getBrands, getCategories, getProducts } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";
import type { Brand, Category } from "@/types/api";

type CatalogueFilters = {
  search?: string;
  category?: string;
  brand?: string;
  product_type?: string;
  page?: string;
};

type CatalogueListingProps = {
  filters: CatalogueFilters;
  salesMethod: "direct_purchase" | "quotation";
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

export default async function CatalogueListing({
  filters,
  salesMethod,
}: CatalogueListingProps) {
  const isQuoteCatalogue = salesMethod === "quotation";
  const basePath = isQuoteCatalogue ? "/quotes" : "/products";
  const page = Math.max(1, Number(filters.page) || 1);
  let products;
  let categories: Category[] = [];
  let brands: Brand[] = [];
  let loadError = "";

  try {
    const [productResponse, categoryResponse, brandResponse] = await Promise.all([
      getProducts({
        search: filters.search,
        category: filters.category,
        brand: filters.brand,
        product_type: filters.product_type,
        sales_method: salesMethod,
        page,
      }),
      getCategories(),
      getBrands({ page_size: 100 }),
    ]);
    products = productResponse;
    categories = categoryResponse.results;
    brands = brandResponse.results;
  } catch (error) {
    loadError = errorText(error);
  }

  function pageHref(nextPage: number): string {
    const query = new URLSearchParams();
    if (filters.search) query.set("search", filters.search);
    if (filters.category) query.set("category", filters.category);
    if (filters.brand) query.set("brand", filters.brand);
    if (filters.product_type) query.set("product_type", filters.product_type);
    query.set("page", String(nextPage));
    return `${basePath}?${query.toString()}`;
  }

  return (
    <section className="catalogue-page">
      <div className="catalogue-heading">
        <p className="eyebrow">
          {isQuoteCatalogue ? "WHITESTAG QUOTE REQUESTS" : "THE WHITESTAG SHOP"}
        </p>
        <h1>
          {isQuoteCatalogue ? "Find it. Request a quote." : "Ready when you are."}
        </h1>
        <p>
          {isQuoteCatalogue
            ? "Explore vehicles and specialist items available by quotation."
            : "Shop available parts and products with straightforward online checkout."}
        </p>
      </div>

      <nav className="catalogue-mode-switch" aria-label="Choose how to shop">
        <Link
          className={!isQuoteCatalogue ? "is-active" : ""}
          href="/products"
          aria-current={!isQuoteCatalogue ? "page" : undefined}
        >
          Buy online
        </Link>
        <Link
          className={isQuoteCatalogue ? "is-active" : ""}
          href="/quotes"
          aria-current={isQuoteCatalogue ? "page" : undefined}
        >
          Request a quote
        </Link>
      </nav>

      <div className="catalogue-layout">
        <form className="catalogue-filters" action={basePath}>
          <label>
            <span>Search</span>
            <input
              className="catalogue-filter-input"
              type="search"
              name="search"
              defaultValue={filters.search ?? ""}
              placeholder="Search products…"
            />
          </label>
          <label>
            <span>Category</span>
            <select name="category" defaultValue={filters.category ?? ""}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Brand</span>
            <select name="brand" defaultValue={filters.brand ?? ""}>
              <option value="">All brands</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.slug}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Product type</span>
            <select
              name="product_type"
              defaultValue={filters.product_type ?? ""}
            >
              <option value="">Everything</option>
              {productTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="filter-submit" type="submit">
            Apply filters
          </button>
          {(filters.search ||
            filters.category ||
            filters.brand ||
            filters.product_type) && (
            <Link className="filter-reset" href={basePath}>
              Clear filters
            </Link>
          )}
        </form>

        <div className="catalogue-results">
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
                  <Link href={pageHref(page - 1)}>← Previous</Link>
                ) : (
                  <span />
                )}
                <span>Page {page}</span>
                {products.next ? (
                  <Link href={pageHref(page + 1)}>Next →</Link>
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
                <Link className="text-link" href={basePath}>
                  View all {isQuoteCatalogue ? "quote-request" : "buy-online"} items
                </Link>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}
