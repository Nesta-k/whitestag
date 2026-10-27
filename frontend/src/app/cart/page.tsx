"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Minus, Plus, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { ProductImage } from "@/components/product-image";
import { PublicShell } from "@/components/site-shell";
import { formatPrice } from "@/lib/format";
import type { DemoOrder } from "@/lib/types";

export default function CartPage() {
    const { products, cart, updateCartQuantity, removeFromCart, placeDemoOrder } = useApp();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("Mobile Money (simulation)");
    const [error, setError] = useState("");
    const [completed, setCompleted] = useState<DemoOrder | null>(null);

    const lines = useMemo(() => cart.flatMap((item) => {
        const product = products.find((candidate) => candidate.id === item.productId);
        return product && product.published && product.salesMode === "buy_now" ? [{ product, quantity: item.quantity }] : [];
    }), [cart, products]);
    const total = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
    const invalidCount = cart.length - lines.length;

    function submitOrder(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        if (!lines.length) {
            setError("Your cart has no available Buy Now items.");
            return;
        }
        if (lines.some(({ product, quantity }) => !Number.isInteger(quantity) || quantity < 1 || quantity > product.stockQuantity)) {
            setError("One or more quantities exceed current stock. Review the cart and try again.");
            return;
        }
        const order = placeDemoOrder({ customerName: name.trim(), email: email.trim(), phone: phone.trim(), items: lines.map(({ product, quantity }) => ({ productId: product.id, quantity })), total, paymentMethod });
        if (!order) {
            setError("We couldn't confirm this demo order. One or more items are no longer available.");
            return;
        }
        setCompleted(order);
    }

    if (completed) return (
        <PublicShell><main className="content-main"><div className="page-wrap checkout-success">
            <div className="success-icon"><Check size={25} /></div><div className="eyebrow">Demo checkout complete</div><h1 className="page-title">A good start.</h1>
            <p>Your simulated order <strong>{completed.id}</strong> is saved in this browser for demonstration. No payment was taken and no real order was processed.</p>
            <div className="success-receipt"><span>Order total</span><strong>{formatPrice(completed.total)}</strong><span>Payment selection</span><strong>{completed.paymentMethod}</strong><span>Current status</span><strong>{completed.status}</strong></div>
            <div className="hero-actions"><Link href="/catalog" className="button-primary">Continue exploring</Link><Link href="/admin/orders" className="button-secondary">View in dashboard</Link></div>
        </div></main></PublicShell>
    );

    return (
        <PublicShell><main className="content-main cart-page"><div className="page-wrap">
            <header className="page-heading"><Link href="/catalog" className="back-link"><ArrowLeft size={14} /> Continue browsing</Link><div className="eyebrow">Your selection</div><h1 className="page-title">Demo cart.</h1><p className="page-subtitle">A local checkout prototype. No payment is processed and no real order is submitted.</p></header>
            {lines.length === 0 ? <div className="empty-state cart-empty"><div><ShoppingBag size={27} /><h2>Your cart is waiting.</h2><p>Only published products in Buy Now mode can be added here.</p><Link href="/catalog" className="button-primary">Browse inventory</Link></div></div> : <div className="cart-layout">
                <section className="cart-items" aria-label="Cart items">
                    {invalidCount > 0 && <div className="notice notice-error">Some unavailable items were removed from checkout. Please add eligible products again from the catalogue.</div>}
                    {lines.map(({ product, quantity }) => <article className="cart-line" key={product.id}>
                        <Link href={`/product/${product.id}`} className="cart-line-image"><ProductImage src={product.images[0]} alt={product.name} /></Link>
                        <div className="cart-line-info"><span className="detail-kicker">{product.brand} / {product.category}</span><Link href={`/product/${product.id}`}><h2>{product.name}</h2></Link><span className="cart-line-model">{product.model}</span><span className="cart-line-price">{formatPrice(product.price)}</span></div>
                        <div className="cart-line-actions"><div className="quantity-stepper"><button type="button" aria-label={`Decrease ${product.name} quantity`} onClick={() => quantity <= 1 ? removeFromCart(product.id) : updateCartQuantity(product.id, quantity - 1)}><Minus size={13} /></button><span>{quantity}</span><button type="button" aria-label={`Increase ${product.name} quantity`} disabled={quantity >= product.stockQuantity} onClick={() => updateCartQuantity(product.id, quantity + 1)}><Plus size={13} /></button></div><button type="button" className="remove-button" onClick={() => removeFromCart(product.id)}><Trash2 size={14} /><span>Remove</span></button></div>
                    </article>)}
                    <div className="cart-items-foot"><ShieldCheck size={15} /><span>Demo items only. Inventory and prices are illustrative.</span></div>
                </section>
                <aside className="checkout-panel">
                    <div className="checkout-panel-head"><span>Order summary</span><span>{lines.length} {lines.length === 1 ? "item" : "items"}</span></div>
                    <div className="summary-row"><span>Subtotal</span><span>{formatPrice(total)}</span></div><div className="summary-row"><span>Delivery</span><span>Discuss after enquiry</span></div><div className="summary-total"><span>Estimated total</span><strong>{formatPrice(total)}</strong></div>
                    <form className="checkout-form" onSubmit={submitOrder}>
                        <div className="eyebrow">Customer details</div>
                        <div className="form-field"><label htmlFor="checkout-name">Full name</label><input id="checkout-name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></div>
                        <div className="form-field"><label htmlFor="checkout-email">Email</label><input id="checkout-email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div>
                        <div className="form-field"><label htmlFor="checkout-phone">Phone</label><input id="checkout-phone" required type="tel" minLength={9} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" /></div>
                        <fieldset className="payment-options"><legend>Payment selection <span>SIMULATION ONLY</span></legend>
                            {["Mobile Money (simulation)", "Pay at collection (simulation)", "Bank transfer (simulation)"].map((method) => <label className="payment-option" key={method}><input type="radio" name="payment" value={method} checked={paymentMethod === method} onChange={(event) => setPaymentMethod(event.target.value)} /><span>{method}</span></label>)}
                        </fieldset>
                        {error && <p className="form-error" role="alert">{error}</p>}
                        <button type="submit" className="button-primary checkout-submit">Place demo order <Check size={15} /></button>
                        <p className="form-note">This is a presentation prototype. No payment will be charged and no customer message will be sent.</p>
                    </form>
                </aside>
            </div>}
        </div></main></PublicShell>
    );
}