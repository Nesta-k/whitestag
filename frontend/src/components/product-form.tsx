"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Save } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "@/components/product-image";
import { useApp } from "@/components/app-provider";
import type { Availability, Condition, Product, ProductCategory, SalesMode } from "@/lib/types";

const categories: ProductCategory[] = ["Cars", "Electric Vehicles", "Tricycles", "Spare Parts"];

function makeSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const { saveProduct } = useApp();
  const [name, setName] = useState(product?.name || "");
  const [category, setCategory] = useState<ProductCategory>(product?.category || "Cars");
  const [brand, setBrand] = useState(product?.brand || "");
  const [model, setModel] = useState(product?.model || "");
  const [description, setDescription] = useState(product?.description || "");
  const [price, setPrice] = useState(product?.price ? String(product.price) : "");
  const [stock, setStock] = useState(product ? String(product.stockQuantity) : "1");
  const [availability, setAvailability] = useState<Availability>(product?.availability || "In stock");
  const [condition, setCondition] = useState<Condition>(product?.condition || "New");
  const [salesMode, setSalesMode] = useState<SalesMode>(product?.salesMode || "buy_now");
  const [published, setPublished] = useState(product?.published ?? true);
  const [imageUrls, setImageUrls] = useState((product?.images || []).join("\n"));
  const [specifications, setSpecifications] = useState(Object.entries(product?.specifications || {}).map(([key, value]) => `${key}: ${value}`).join("\n"));
  const [error, setError] = useState("");
  const firstImage = imageUrls.split(/[\n,]/).map((url) => url.trim()).filter(Boolean)[0];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsedPrice = Number(price);
    const parsedStock = Number(stock);
    if (!name.trim() || !brand.trim() || !model.trim() || !description.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isInteger(parsedStock) || parsedStock < 0) {
      setError("Complete all required fields and enter a valid price and stock quantity.");
      return;
    }
    const specs = Object.fromEntries(specifications.split("\n").map((line) => {
      const separator = line.indexOf(":");
      return separator > -1 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : ["", ""];
    }).filter(([key, value]) => key && value));
    const images = imageUrls.split(/[\n,]/).map((url) => url.trim()).filter(Boolean);
    const nextProduct: Product = {
      id: product?.id || `apx-${Date.now()}`,
      slug: makeSlug(`${brand} ${model || name}`),
      name: name.trim(), category, brand: brand.trim(), model: model.trim(), description: description.trim(),
      price: parsedPrice, currency: "GHS", images, specifications: specs, stockQuantity: parsedStock,
      availability, condition, published, salesMode, createdAt: product?.createdAt || new Date().toISOString(),
    };
    saveProduct(nextProduct);
    router.push("/admin/products");
  }

  return (
    <form className="product-editor" onSubmit={submit}>
      <div className="editor-columns">
        <div className="editor-main">
          <section className="admin-panel editor-section"><div className="admin-panel-head"><div><span className="panel-kicker">Product identity</span><h2>What are we listing?</h2></div></div>
            <div className="editor-grid">
              <div className="form-field editor-span-2"><label htmlFor="product-name">Product name *</label><input id="product-name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Land Cruiser Prado" /></div>
              <div className="form-field"><label htmlFor="product-category">Category *</label><select id="product-category" value={category} onChange={(event) => setCategory(event.target.value as ProductCategory)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div className="form-field"><label htmlFor="product-brand">Brand *</label><input id="product-brand" required value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="e.g. Toyota" /></div>
              <div className="form-field editor-span-2"><label htmlFor="product-model">Model *</label><input id="product-model" required value={model} onChange={(event) => setModel(event.target.value)} placeholder="e.g. Prado 2.8D VX" /></div>
              <div className="form-field editor-span-2"><label htmlFor="product-description">Description *</label><textarea id="product-description" required rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
            </div>
          </section>
          <section className="admin-panel editor-section"><div className="admin-panel-head"><div><span className="panel-kicker">Product media</span><h2>Image URLs</h2></div><Eye size={16} /></div>
            <div className="form-field"><label htmlFor="product-images">Paste one image URL per line</label><textarea id="product-images" rows={3} value={imageUrls} onChange={(event) => setImageUrls(event.target.value)} placeholder="https://…" /><small className="field-help">Images are loaded from the entered URLs. A fallback image appears if a URL fails.</small></div>
            {firstImage && <div className="editor-preview"><ProductImage src={firstImage} alt="Product image preview" /><span>Preview · first image</span></div>}
          </section>
          <section className="admin-panel editor-section"><div className="admin-panel-head"><div><span className="panel-kicker">Vehicle or part data</span><h2>Specifications</h2></div></div>
            <div className="form-field"><label htmlFor="product-specs">One “Label: value” pair per line</label><textarea id="product-specs" rows={6} value={specifications} onChange={(event) => setSpecifications(event.target.value)} placeholder={'Year: 2024\nEngine: 2.0L turbo\nTransmission: Automatic'} /></div>
          </section>
        </div>
        <aside className="editor-side">
          <section className="admin-panel editor-section"><div className="admin-panel-head"><div><span className="panel-kicker">Commercial details</span><h2>Price & stock</h2></div></div>
            <div className="form-field"><label htmlFor="product-price">Price *</label><div className="currency-input"><span>GHS</span><input id="product-price" type="number" required min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></div></div>
            <div className="form-field"><label htmlFor="product-stock">Stock quantity *</label><input id="product-stock" type="number" required min="0" step="1" value={stock} onChange={(event) => setStock(event.target.value)} /></div>
            <div className="form-field"><label htmlFor="product-availability">Availability</label><select id="product-availability" value={availability} onChange={(event) => setAvailability(event.target.value as Availability)}><option>In stock</option><option>Low stock</option><option>Out of stock</option><option>Preorder</option></select></div>
            <div className="form-field"><label htmlFor="product-condition">Condition</label><select id="product-condition" value={condition} onChange={(event) => setCondition(event.target.value as Condition)}><option>New</option><option>Used</option><option>Refurbished</option></select></div>
          </section>
          <section className="admin-panel editor-section"><div className="admin-panel-head"><div><span className="panel-kicker">Purchase experience</span><h2>Sales mode</h2></div></div>
            <div className="form-field"><label htmlFor="product-sales-mode">How can customers buy?</label><select id="product-sales-mode" value={salesMode} onChange={(event) => setSalesMode(event.target.value as SalesMode)}><option value="buy_now">Buy Now</option><option value="quote">Request a Quote</option><option value="preorder">Preorder</option></select><small className="field-help">Buy Now items alone may be placed in the demo cart.</small></div>
            <label className="publish-toggle"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /><span><strong>Published</strong><small>{published ? "Visible in the public catalogue" : "Hidden from the public catalogue"}</small></span><span className="toggle-track" /></label>
          </section>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="editor-actions"><Link href="/admin/products" className="button-dark"><ArrowLeft size={14} /> Cancel</Link><button type="submit" className="button-primary"><Save size={15} /> Save product</button></div>
        </aside>
      </div>
    </form>
  );
}