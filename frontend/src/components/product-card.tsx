"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import type { Product } from "@/lib/types";
import { formatPrice, salesModeLabel } from "@/lib/format";
import { ProductImage } from "@/components/product-image";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
    return (
        <motion.article className="product-card" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.42, delay: Math.min(index * 0.045, 0.2) }}>
            <Link href={`/product/${product.id}`} className="product-card-link" aria-label={`View ${product.name}`}>
                <div className="product-card-image-wrap">
                    <ProductImage src={product.images[0]} alt={product.name} className="product-card-image" />
                    <span className="category-chip">{product.category}</span>
                    <span className={`stock-dot ${product.stockQuantity ? "available" : "unavailable"}`} aria-hidden="true" />
                </div>
                <div className="product-card-body">
                    <div className="product-card-kicker">{product.brand} <span>/</span> {product.model}</div>
                    <h3>{product.name}</h3>
                    <div className="product-card-bottom">
                        <div>
                            <span className="price-label">From</span>
                            <strong>{formatPrice(product.price)}</strong>
                        </div>
                        <span className={`mode-badge mode-${product.salesMode}`}>{salesModeLabel[product.salesMode]}</span>
                        <ArrowUpRight className="card-arrow" size={18} aria-hidden="true" />
                    </div>
                </div>
            </Link>
        </motion.article>
    );
}