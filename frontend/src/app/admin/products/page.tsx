"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Edit3, Plus, Search, Trash2 } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { formatPrice, salesModeLabel } from "@/lib/format";
import type { ProductCategory } from "@/lib/types";

export default function AdminProductsPage() {
  const { products, saveProduct, deleteProduct } = useApp();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [publication, setPublication] = useState("");
  const results = useMemo(() => products.filter((product) => {
    const search = `${product.name} ${product.brand} ${product.model}`.toLowerCase();
    return (!query || search.includes(query.toLowerCase())) && (!category || product.category === category) && (publication === "" || String(product.published) === publication);
  }), [products, query, category, publication]);

  function remove(id: string, name: string) {
    if (window.confirm(`Delete “${name}” from this local demo inventory?`)) deleteProduct(id);
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head"><div><div className="eyebrow">Product management</div><h1>Inventory.</h1><p>Maintain published listings and manage demo catalogue details.</p></div><Link href="/admin/products/new" className="button-primary"><Plus size={16} /> Add product</Link></div>
      <div className="inventory-tools"><label className="inventory-search"><Search size={15} /><input aria-label="Search inventory" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, brand or model" /></label><select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{(["Cars", "Electric Vehicles", "Tricycles", "Spare Parts"] as ProductCategory[]).map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by publication" value={publication} onChange={(event) => setPublication(event.target.value)}><option value="">All status</option><option value="true">Published</option><option value="false">Draft</option></select><span>{results.length} products</span></div>
      <div className="admin-table-wrap"><table className="admin-table inventory-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Sales mode</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {results.map((product) => <tr key={product.id}><td><div className="table-product"><span className="table-product-thumb" style={{ backgroundImage: `url("${product.images[0] || ""}")` }} /><div><Link href={`/admin/products/${product.id}`}>{product.name}</Link><small>{product.brand} · {product.model}</small></div></div></td><td>{product.category}</td><td>{formatPrice(product.price)}</td><td>{product.stockQuantity}</td><td><span className={`mode-badge mode-${product.salesMode}`}>{salesModeLabel[product.salesMode]}</span></td><td><button type="button" className={`publication-pill ${product.published ? "published" : "draft"}`} onClick={() => saveProduct({ ...product, published: !product.published })}><span />{product.published ? "Published" : "Draft"}</button></td><td><div className="table-actions"><Link href={`/admin/products/${product.id}`} aria-label={`Edit ${product.name}`} title="Edit product"><Edit3 size={15} /></Link><button type="button" aria-label={`Delete ${product.name}`} title="Delete product" onClick={() => remove(product.id, product.name)}><Trash2 size={15} /></button></div></td></tr>)}
        {!results.length && <tr><td colSpan={7}><div className="table-empty"><strong>No products match these filters.</strong><button type="button" onClick={() => { setQuery(""); setCategory(""); setPublication(""); }}>Clear filters</button></div></td></tr>}
      </tbody></table></div>
      <div className="admin-footnote"><Check size={13} /> Product edits, publication status, and deletions are stored in localStorage for this demo.</div>
    </div>
  );
}