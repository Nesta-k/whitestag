"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { useApp } from "@/components/app-provider";
import type { ProductCategory } from "@/lib/types";

const categoryOptions: ProductCategory[] = ["Cars", "Electric Vehicles", "Tricycles", "Spare Parts"];

export function CatalogBrowser() {
    const { products } = useApp();
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("");
    const [brand, setBrand] = useState("");
    const [availability, setAvailability] = useState("");
    const [condition, setCondition] = useState("");
    const [minimum, setMinimum] = useState("");
    const [maximum, setMaximum] = useState("");
    const [sort, setSort] = useState("newest");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        startTransition(() => {
            setQuery(params.get("q") || "");
            setCategory(params.get("category") || "");
        });
        const timeout = window.setTimeout(() => setLoading(false), 220);
        return () => window.clearTimeout(timeout);
    }, []);

    const brands = useMemo(() => [...new Set(products
        .filter((product) => product.published && (!category || product.category === category))
        .map((product) => product.brand))].sort((a, b) => a.localeCompare(b)), [products, category]);

    const results = useMemo(() => {
        const filtered = products.filter((product) => {
            if (!product.published) return false;
            const search = `${product.name} ${product.brand} ${product.model}`.toLowerCase();
            return (!query || search.includes(query.toLowerCase()))
                && (!category || product.category === category)
                && (!brand || product.brand === brand)
                && (!availability || product.availability === availability)
                && (!condition || product.condition === condition)
                && (!minimum || product.price >= Number(minimum))
                && (!maximum || product.price <= Number(maximum));
        });
        return filtered.sort((a, b) => sort === "price-asc" ? a.price - b.price : sort === "price-desc" ? b.price - a.price : b.createdAt.localeCompare(a.createdAt));
    }, [products, query, category, brand, availability, condition, minimum, maximum, sort]);

    function clearFilters() {
        setQuery(""); setCategory(""); setBrand(""); setAvailability(""); setCondition(""); setMinimum(""); setMaximum(""); setSort("newest");
        window.history.replaceState({}, "", "/catalog");
    }

    return (
        <div className="catalog-layout">
            <aside className="filters" aria-label="Catalogue filters">
                <div className="filter-head"><strong><SlidersHorizontal size={14} style={{ verticalAlign: "-3px", marginRight: 6 }} /> Refine results</strong><button type="button" onClick={clearFilters}>Clear all</button></div>
                <div className="filter-group"><label htmlFor="catalog-search">Search</label><div style={{ position: "relative" }}><Search size={14} style={{ position: "absolute", top: 12, left: 10, color: "var(--dim)" }} /><input id="catalog-search" style={{ paddingLeft: 30 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, brand, model" /></div></div>
                <div className="filter-group"><label htmlFor="category-filter">Category</label><select id="category-filter" value={category} onChange={(event) => { setCategory(event.target.value); setBrand(""); }}><option value="">All categories</option>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></div>
                <div className="filter-group"><label htmlFor="brand-filter">Brand / make</label><select id="brand-filter" value={brand} onChange={(event) => setBrand(event.target.value)}><option value="">All brands</option>{brands.map((item) => <option key={item}>{item}</option>)}</select></div>
                <div className="filter-group"><span>Price range · GHS</span><div className="price-inputs"><input aria-label="Minimum price" inputMode="numeric" value={minimum} onChange={(event) => setMinimum(event.target.value.replace(/\D/g, ""))} placeholder="Min" /><input aria-label="Maximum price" inputMode="numeric" value={maximum} onChange={(event) => setMaximum(event.target.value.replace(/\D/g, ""))} placeholder="Max" /></div></div>
                <div className="filter-group"><label htmlFor="availability-filter">Availability</label><select id="availability-filter" value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="">Any availability</option><option>In stock</option><option>Low stock</option><option>Out of stock</option><option>Preorder</option></select></div>
                <div className="filter-group"><label htmlFor="condition-filter">Condition</label><select id="condition-filter" value={condition} onChange={(event) => setCondition(event.target.value)}><option value="">Any condition</option><option>New</option><option>Used</option><option>Refurbished</option></select></div>
            </aside>
            <section aria-label="Catalogue results">
                <div className="catalog-results-head"><span>{loading ? "Loading inventory…" : `${results.length} ${results.length === 1 ? "result" : "results"}`}</span><div className="sort-control"><label htmlFor="sort">Sort by</label><select id="sort" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></div></div>
                {loading ? <div className="catalog-grid" aria-label="Loading products"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div> : results.length ? <div className="catalog-grid">{results.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div> : <div className="empty-state"><div><h2>No matches found</h2><p>Try adjusting your filters or search terms.</p><button className="button-primary" onClick={clearFilters}>Clear filters</button></div></div>}
            </section>
        </div>
    );
}