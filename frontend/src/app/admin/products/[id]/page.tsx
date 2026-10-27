"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { ProductForm } from "@/components/product-form";

export default function EditProductPage() {
  const [id, setId] = useState("");
  const { products } = useApp();
  useEffect(() => {
    startTransition(() => setId(window.location.pathname.split("/").filter(Boolean).at(-1) || ""));
  }, []);
  const product = products.find((item) => item.id === id);
  if (!id) return <div className="admin-page"><div className="skeleton" style={{ height: 220 }} /></div>;
  if (!product) return <div className="admin-page"><div className="admin-empty"><h2>Product not found</h2><p>This local demo listing may have been deleted.</p><Link href="/admin/products">Back to inventory</Link></div></div>;
  return <div className="admin-page"><div className="admin-page-head"><div><div className="eyebrow">Inventory management</div><h1>Edit product.</h1><p>Update listing details for {product.name}.</p></div></div><ProductForm product={product} /></div>;
}