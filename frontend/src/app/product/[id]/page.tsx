"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Check, Minus, Plus, ShieldCheck, ShoppingBag } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { ProductCard } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { PublicShell } from "@/components/site-shell";
import { formatPrice, salesModeLabel } from "@/lib/format";
import type { Enquiry } from "@/lib/types";

export default function ProductDetailPage() {
    const [productId, setProductId] = useState("");
    const { products, addToCart, submitEnquiry } = useApp();
    const [imageIndex, setImageIndex] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const [notice, setNotice] = useState("");
    const [success, setSuccess] = useState(false);
    const [formError, setFormError] = useState("");
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [enquiryQuantity, setEnquiryQuantity] = useState(1);

    useEffect(() => {
        startTransition(() => setProductId(window.location.pathname.split("/").filter(Boolean).at(-1) || ""));
    }, []);

    const product = products.find((item) => item.id === productId || item.slug === productId);
    if (!productId) {
        return <PublicShell><main className="content-main"><div className="page-wrap"><div className="skeleton" style={{ height: 360, margin: "36px 0" }} /></div></main></PublicShell>;
    }
    if (!product || !product.published) {
        return <PublicShell><main className="content-main"><div className="page-wrap"><div className="empty-state" style={{ margin: "70px 0" }}><div><h2>Vehicle not found</h2><p>This item may have been removed or is no longer published.</p><Link className="button-primary" href="/catalog">Back to inventory</Link></div></div></div></main></PublicShell>;
    }
    const currentProduct = product;

    const related = products.filter((item) => item.published && item.id !== product.id && item.category === product.category).slice(0, 3);

    function handleAddToCart() {
        const error = addToCart(currentProduct.id, quantity);
        setNotice(error || `${quantity} ${quantity === 1 ? "item" : "items"} added to your demo cart.`);
        setSuccess(!error);
    }

    function handleEnquiry(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setFormError("");
        const validPhone = phone.replace(/\D/g, "").length >= 9;
        if (!name.trim() || !validPhone || !email.includes("@") || enquiryQuantity < 1) {
            setFormError("Enter your name, a valid phone number, email, and quantity to continue.");
            return;
        }
        const type: Enquiry["type"] = currentProduct.salesMode === "quote" ? "Quote" : "Preorder";
        submitEnquiry({ productId: currentProduct.id, type, name: name.trim(), phone: phone.trim(), email: email.trim(), quantity: enquiryQuantity, message: message.trim() });
        setSuccess(true);
    }

    return (
        <PublicShell><main className="content-main detail-page">
            <div className="page-wrap">
                <div className="detail-breadcrumb"><Link href="/catalog"><ArrowLeft size={14} /> Inventory</Link><span>/</span><span>{product.category}</span><span>/</span><span>{product.name}</span></div>
                <div className="detail-layout">
                    <div className="gallery-column">
                        <ProductImage src={product.images[imageIndex]} alt={`${product.name} view ${imageIndex + 1}`} className="detail-main-image" priority />
                        {product.images.length > 1 && <div className="gallery-thumbnails">{product.images.map((src, index) => <button type="button" className={imageIndex === index ? "selected" : ""} key={src} onClick={() => setImageIndex(index)} aria-label={`Show image ${index + 1}`}><ProductImage src={src} alt="" /></button>)}</div>}
                        <div className="detail-description"><div className="eyebrow">Built for the road</div><h2>About this {product.category === "Spare Parts" ? "part" : "model"}</h2><p>{product.description}</p></div>
                    </div>
                    <aside className="detail-panel">
                        <div className="detail-kicker">{product.brand} <span>/</span> {product.category}</div>
                        <h1>{product.name}</h1>
                        <p className="detail-model">{product.model} · {product.condition}</p>
                        <div className="detail-price">{formatPrice(product.price)} <span>GHS</span></div>
                        <div className="detail-stock"><span className={`availability-indicator ${product.stockQuantity > 0 ? "in-stock" : "out-stock"}`} />{product.availability}{product.stockQuantity > 0 && ` · ${product.stockQuantity} available`}</div>
                        <div className="detail-mode"><span>How to purchase</span><strong className={`mode-badge mode-${product.salesMode}`}>{salesModeLabel[product.salesMode]}</strong></div>

                        {product.salesMode === "buy_now" ? (
                            <div className="purchase-action">
                                <div className="quantity-stepper"><button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus size={14} /></button><span>{quantity}</span><button type="button" aria-label="Increase quantity" disabled={quantity >= product.stockQuantity} onClick={() => setQuantity(Math.min(product.stockQuantity, quantity + 1))}><Plus size={14} /></button></div>
                                <button type="button" className="button-primary" disabled={!product.stockQuantity} onClick={handleAddToCart}><ShoppingBag size={16} /> Add to demo cart</button>
                                {!product.stockQuantity && <p className="form-note">This item is currently unavailable to buy.</p>}
                                {notice && <div className={`notice ${success ? "notice-success" : "notice-error"}`}>{success && <Check size={15} />}{notice} {success && <Link href="/cart">View cart</Link>}</div>}
                            </div>
                        ) : success ? (
                            <div className="success-panel"><span><Check size={17} /></span><div><strong>Your request is saved in this demo.</strong><p>No message was sent or order processed. The WhiteStag team can follow up in the owner dashboard prototype.</p></div></div>
                        ) : (
                            <form className="inquiry-form" onSubmit={handleEnquiry}>
                                {product.salesMode === "preorder" && <div className="preorder-notice"><strong>Availability notice</strong><span>This item is not currently available from stock. Submit a preorder enquiry to register interest. No reservation or payment is taken.</span></div>}
                                <div className="form-field"><label htmlFor="inquiry-name">Full name</label><input id="inquiry-name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></div>
                                <div className="form-two"><div className="form-field"><label htmlFor="inquiry-phone">Phone</label><input id="inquiry-phone" required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" /></div><div className="form-field"><label htmlFor="inquiry-email">Email</label><input id="inquiry-email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div></div>
                                <div className="form-field"><label htmlFor="inquiry-quantity">{product.salesMode === "quote" ? "Quantity" : "Expected quantity"}</label><input id="inquiry-quantity" type="number" min="1" max="99" required value={enquiryQuantity} onChange={(event) => setEnquiryQuantity(Number(event.target.value))} /></div>
                                {product.salesMode === "quote" && <div className="form-field"><label htmlFor="inquiry-message">Message <span>Optional</span></label><textarea id="inquiry-message" rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell us what you would like to know" /></div>}
                                {formError && <p className="form-error" role="alert">{formError}</p>}
                                <button className="button-primary form-submit" type="submit">{product.salesMode === "quote" ? "Send quote request" : "Register preorder interest"} <ArrowUpRight size={15} /></button>
                                <p className="form-note">Demo only. This records an enquiry locally and does not send a message or reserve a vehicle.</p>
                            </form>
                        )}
                        <div className="detail-assurance"><ShieldCheck size={16} /><span>Fictional demo inventory. Details and prices are illustrative.</span></div>
                    </aside>
                </div>

                <section className="spec-section"><div className="eyebrow">The details</div><h2>Specifications</h2><dl className="spec-grid">{Object.entries(product.specifications).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></section>
                {related.length > 0 && <section className="section related-section"><div className="section-inner"><div className="section-head"><div><div className="eyebrow">Keep exploring</div><h2>Related inventory</h2></div><Link href="/catalog" className="text-link">Full inventory <ArrowUpRight size={15} /></Link></div><div className="product-grid">{related.map((item, index) => <ProductCard key={item.id} product={item} index={index} />)}</div></div></section>}
            </div>
        </main></PublicShell>
    );
}