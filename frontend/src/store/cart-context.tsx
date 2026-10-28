"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as cartApi from "@/lib/api/cart";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "./auth-context";
import type { Cart } from "@/types/api";

interface CartContextValue {
  cart: Cart | null;
  isLoading: boolean;
  error: string;
  refresh: () => Promise<void>;
  updateQuantity: (itemId: number, quantity: number) => Promise<void>;
  removeItem: (itemId: number) => Promise<void>;
  addItem: (productId: number, quantity?: number) => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { customer, isLoading: authLoading } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!customer) {
      setCart(null);
      setError("");
      return;
    }
    setIsLoading(true);
    try {
      setCart(await cartApi.getCart());
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "Could not load your cart.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [customer]);

  useEffect(() => {
    if (!authLoading) void refresh();
  }, [authLoading, refresh]);

  const updateQuantity = useCallback(
    async (itemId: number, quantity: number) => {
      await cartApi.updateCartItem(itemId, quantity);
      await refresh();
    },
    [refresh],
  );
  const removeItem = useCallback(
    async (itemId: number) => {
      await cartApi.removeCartItem(itemId);
      await refresh();
    },
    [refresh],
  );
  const addItem = useCallback(
    async (productId: number, quantity = 1) => {
      await cartApi.addCartItem(productId, quantity);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      cart,
      isLoading: authLoading || isLoading,
      error,
      refresh,
      updateQuantity,
      removeItem,
      addItem,
    }),
    [
      cart,
      authLoading,
      isLoading,
      error,
      refresh,
      updateQuantity,
      removeItem,
      addItem,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider.");
  }
  return context;
}
