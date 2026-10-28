"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getBrands, getCategories, getProducts } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";
import type { Brand, Category, Product } from "@/types/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { ProductCard } from "@/components/ui/product-card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductListing({ categorySlug }: { categorySlug?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(categorySlug ?? "");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedSalesMethod, setSelectedSalesMethod] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await getProducts({
        category: selectedCategory || undefined,
        brand: selectedBrand || undefined,
        product_type: selectedType || undefined,
        sales_method: selectedSalesMethod || undefined,
        page,
      });
      setProducts(response.results);
      setCount(response.count);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "The catalogue could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, selectedBrand, selectedCategory, selectedSalesMethod, selectedType]);

  useEffect(() => {
    setSelectedCategory(categorySlug ?? "");
    setPage(1);
  }, [categorySlug]);

  useEffect(() => {
    void Promise.all([getCategories(), getBrands()])
      .then(([categoryResponse, brandResponse]) => {
        setCategories(categoryResponse.results);
        setBrands(brandResponse.results);
      })
      .catch(() => {
        setCategories([]);
        setBrands([]);
      });
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryBrand = params.get("brand");
    const querySearch = params.get("search");
    const queryType = params.get("product_type");
    if (queryBrand) setSelectedBrand(queryBrand);
    if (querySearch) setSearch(querySearch);
    if (queryType) setSelectedType(queryType);
  }, []);

  const visibleProducts = products.filter((product) => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return true;
    return [
      product.name,
      product.sku,
      product.brand?.name ?? "",
      product.category.name,
    ].some((value) => value.toLocaleLowerCase().includes(query));
  });
  const pageCount = Math.max(1, Math.ceil(count / 20));

  const title = categorySlug
    ? categories.find((category) => category.slug === categorySlug)?.name ??
      "Shop this category"
    : "Parts for the road ahead";

  return (
    <div className="page-container section-space">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WhiteStag catalogue</p>
          <h1>{title}</h1>
          <p>Find dependable parts from brands you know and trust.</p>
        </div>
        <p className="result-count">
          {isLoading ? "Loading catalogue…" : `${count} items`}
        </p>
      </div>

      <div className="catalogue-toolbar">
        <Input
          label="Search this page"
          name="catalogue-search"
          type="search"
          placeholder="Search name, SKU or brand"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          label="Category"
          name="category"
          value={selectedCategory}
          onChange={(event) => { setSelectedCategory(event.target.value); setPage(1); }}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option value={category.slug} key={category.id}>{category.name}</option>
          ))}
        </Select>
        <Select
          label="Brand"
          name="brand"
          value={selectedBrand}
          onChange={(event) => { setSelectedBrand(event.target.value); setPage(1); }}
        >
          <option value="">All brands</option>
          {brands.map((brand) => (
            <option value={brand.slug} key={brand.id}>{brand.name}</option>
          ))}
        </Select>
        <Select
          label="Product type"
          name="product_type"
          value={selectedType}
          onChange={(event) => { setSelectedType(event.target.value); setPage(1); }}
        >
          <option value="">All product types</option>
          <option value="spare_part">Spare parts</option>
          <option value="car">Cars</option>
          <option value="electric_vehicle">Electric vehicles</option>
          <option value="tricycle">Tricycles</option>
          <option value="motorcycle_bike">Motorcycles</option>
          <option value="other">Other</option>
        </Select>
        <Select
          label="Sales method"
          name="sales_method"
          value={selectedSalesMethod}
          onChange={(event) => { setSelectedSalesMethod(event.target.value); setPage(1); }}
        >
          <option value="">All sales methods</option>
          <option value="direct_purchase">Direct purchase</option>
          <option value="quotation">Quote required</option>
        </Select>
        <Button href="/cart" variant="outline">View cart</Button>
      </div>
      <p className="catalogue-note">
        Search filters the current results page. Use the filters and page controls to browse the live backend catalogue.
      </p>

      {error ? <ErrorState message={error} onRetry={() => void loadProducts()} /> : null}
      {isLoading ? (
        <div className="product-grid">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="product-skeleton" />
          ))}
        </div>
      ) : null}
      {!isLoading && !error && visibleProducts.length === 0 ? (
        <EmptyState
          title={products.length ? "No matching products on this page" : "No products found"}
          description={products.length ? "Try a different search term or browse another page." : "Try another category, brand or product type, or check back as our catalogue grows."}
          action={<Link className="text-link" href="/products">Show all parts</Link>}
        />
      ) : null}
      {!isLoading && !error && visibleProducts.length > 0 ? (
        <div className="product-grid">
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : null}
      {!isLoading && !error && count > 0 ? (
        <nav className="pagination" aria-label="Catalogue pages">
          <Button type="button" variant="outline" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
          <span>Page {page} of {pageCount} · {count} products</span>
          <Button type="button" variant="outline" disabled={page >= pageCount || isLoading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</Button>
        </nav>
      ) : null}
    </div>
  );
}
