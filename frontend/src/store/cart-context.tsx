"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
} from "@/lib/api/cart";
import type { Cart } from "@/types/api";
import { useAuth } from "./auth-context";
import { ApiError } from "@/lib/api/client";

interface CartContextValue {
  cart: Cart | null;
  itemCount: number;
  loading: boolean;
  error: string | null;
  addItem: (productId: number, quantity?: number) => Promise<void>;
  updateItem: (itemId: number, quantity: number) => Promise<void>;
  removeItem: (itemId: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setCart(null);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const data = await getCart();
      setCart(data);
      setError(null);
    } catch (requestError) {
      setCart(null);
      setError(
        requestError instanceof ApiError
          ? `The cart service returned an error (${requestError.status}).`
          : requestError instanceof Error
            ? requestError.message
            : "Could not load your cart.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = useCallback(
    async (productId: number, quantity = 1) => {
      await addToCart({ product_id: productId, quantity });
      await refresh();
    },
    [refresh]
  );

  const updateItem = useCallback(
    async (itemId: number, quantity: number) => {
      await updateCartItem(itemId, quantity);
      await refresh();
    },
    [refresh]
  );

  const removeItem = useCallback(
    async (itemId: number) => {
      await removeCartItem(itemId);
      await refresh();
    },
    [refresh]
  );

  const itemCount = cart?.item_count ?? 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        itemCount,
        loading,
        error,
        addItem,
        updateItem,
        removeItem,
        refresh,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
