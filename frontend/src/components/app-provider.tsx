"use client";

import { createContext, startTransition, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { demoProducts } from "@/lib/demo-data";
import type { CartItem, DemoOrder, Enquiry, Product } from "@/lib/types";

type EnquiryDraft = Omit<Enquiry, "id" | "status" | "createdAt">;
type OrderDraft = Omit<DemoOrder, "id" | "status" | "createdAt">;

type AppContextValue = {
    products: Product[];
    cart: CartItem[];
    orders: DemoOrder[];
    enquiries: Enquiry[];
    addToCart: (productId: string, quantity: number) => string | null;
    updateCartQuantity: (productId: string, quantity: number) => void;
    removeFromCart: (productId: string) => void;
    clearCart: () => void;
    placeDemoOrder: (draft: OrderDraft) => DemoOrder | null;
    submitEnquiry: (draft: EnquiryDraft) => Enquiry;
    saveProduct: (product: Product) => void;
    deleteProduct: (productId: string) => void;
    updateOrderStatus: (orderId: string, status: DemoOrder["status"]) => void;
    updateEnquiryStatus: (enquiryId: string, status: Enquiry["status"]) => void;
};

const AppContext = createContext<AppContextValue | null>(null);
const storageKeys = { products: "apex-products", productSeedVersion: "apex-products-seed-version", cart: "apex-cart", orders: "apex-orders", enquiries: "apex-enquiries" };

function readStorage<T>(key: string, fallback: T): T {
    try {
        const value = window.localStorage.getItem(key);
        return value ? (JSON.parse(value) as T) : fallback;
    } catch {
        return fallback;
    }
}

export function AppProvider({ children }: { children: ReactNode }) {
    const [products, setProducts] = useState(demoProducts);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [orders, setOrders] = useState<DemoOrder[]>([]);
    const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const savedProducts = readStorage<Product[] | null>(storageKeys.products, null);
        const savedSeedVersion = readStorage<number | null>(storageKeys.productSeedVersion, null);
        const newSampleProducts = demoProducts.filter((product) => Number(product.id.slice(4)) >= 11);
        const storedProducts = savedProducts && savedSeedVersion === null
            ? [...savedProducts, ...newSampleProducts.filter((product) => !savedProducts.some((saved) => saved.id === product.id))]
            : savedProducts || demoProducts;
        const storedCart = readStorage(storageKeys.cart, []);
        const storedOrders = readStorage(storageKeys.orders, []);
        const storedEnquiries = readStorage(storageKeys.enquiries, []);
        startTransition(() => {
            setProducts(storedProducts);
            setCart(storedCart);
            setOrders(storedOrders);
            setEnquiries(storedEnquiries);
            setReady(true);
        });
    }, []);

    useEffect(() => {
        if (!ready) return;
        try {
            window.localStorage.setItem(storageKeys.products, JSON.stringify(products));
            window.localStorage.setItem(storageKeys.cart, JSON.stringify(cart));
            window.localStorage.setItem(storageKeys.orders, JSON.stringify(orders));
            window.localStorage.setItem(storageKeys.enquiries, JSON.stringify(enquiries));
            window.localStorage.setItem(storageKeys.productSeedVersion, "2");
        } catch {
            // The in-memory demo remains usable when browser storage is unavailable.
        }
    }, [products, cart, orders, enquiries, ready]);

    const value = useMemo<AppContextValue>(() => ({
        products,
        cart,
        orders,
        enquiries,
        addToCart(productId, quantity) {
            const product = products.find((item) => item.id === productId);
            if (!product || !product.published) return "This item is not available.";
            if (product.salesMode !== "buy_now") return "Only Buy Now products can be added to the cart.";
            if (!Number.isInteger(quantity) || quantity < 1) return "Choose a valid quantity.";
            if (product.stockQuantity < 1 || quantity > product.stockQuantity) return "There is not enough stock for that quantity.";
            setCart((current) => {
                const existing = current.find((item) => item.productId === productId);
                if (existing) {
                    return current.map((item) => item.productId === productId
                        ? { ...item, quantity: Math.min(product.stockQuantity, item.quantity + quantity) }
                        : item);
                }
                return [...current, { productId, quantity }];
            });
            return null;
        },
        updateCartQuantity(productId, quantity) {
            const product = products.find((item) => item.id === productId);
            if (!product || product.salesMode !== "buy_now" || quantity < 1) {
                setCart((current) => current.filter((item) => item.productId !== productId));
                return;
            }
            setCart((current) => current.map((item) => item.productId === productId
                ? { ...item, quantity: Math.min(product.stockQuantity, quantity) }
                : item));
        },
        removeFromCart(productId) {
            setCart((current) => current.filter((item) => item.productId !== productId));
        },
        clearCart() {
            setCart([]);
        },
        placeDemoOrder(draft) {
            const valid = draft.items.length > 0 && draft.items.every((item) => {
                const product = products.find((candidate) => candidate.id === item.productId);
                return Boolean(product && product.published && product.salesMode === "buy_now" && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= product.stockQuantity);
            });
            if (!valid) return null;
            const order: DemoOrder = { ...draft, id: `APX-${Date.now().toString().slice(-6)}`, status: "Pending", createdAt: new Date().toISOString() };
            setOrders((current) => [order, ...current]);
            setProducts((current) => current.map((product) => {
                const ordered = draft.items.find((item) => item.productId === product.id);
                return ordered ? { ...product, stockQuantity: Math.max(0, product.stockQuantity - ordered.quantity), availability: product.stockQuantity - ordered.quantity > 0 ? "In stock" : "Out of stock" } : product;
            }));
            setCart([]);
            return order;
        },
        submitEnquiry(draft) {
            const enquiry: Enquiry = { ...draft, id: `ENQ-${Date.now().toString().slice(-6)}`, status: "New", createdAt: new Date().toISOString() };
            setEnquiries((current) => [enquiry, ...current]);
            return enquiry;
        },
        saveProduct(product) {
            setProducts((current) => current.some((item) => item.id === product.id)
                ? current.map((item) => item.id === product.id ? product : item)
                : [product, ...current]);
        },
        deleteProduct(productId) {
            setProducts((current) => current.filter((item) => item.id !== productId));
            setCart((current) => current.filter((item) => item.productId !== productId));
        },
        updateOrderStatus(orderId, status) {
            setOrders((current) => current.map((order) => order.id === orderId ? { ...order, status } : order));
        },
        updateEnquiryStatus(enquiryId, status) {
            setEnquiries((current) => current.map((enquiry) => enquiry.id === enquiryId ? { ...enquiry, status } : enquiry));
        },
    }), [products, cart, orders, enquiries]);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) throw new Error("useApp must be used inside AppProvider");
    return context;
}