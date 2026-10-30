"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  addWishlistItem,
  getWishlist,
  removeWishlistItem,
} from "@/lib/api/wishlist";
import type { WishlistItem } from "@/types/api";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "./auth-context";

interface WishlistContextValue {
  items: WishlistItem[];
  count: number;
  loading: boolean;
  error: string | null;
  isSaved: (productId: number) => boolean;
  toggle: (productId: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !user) {
      setItems([]);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const data = await getWishlist();
      setItems(data.results);
      setError(null);
    } catch (requestError) {
      setItems([]);
      setError(
        requestError instanceof ApiError
          ? `The wishlist service returned an error (${requestError.status}).`
          : requestError instanceof Error
            ? requestError.message
            : "Could not load your wishlist.",
      );
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isSaved = useCallback(
    (productId: number) =>
      items.some((item) => item.product.id === productId),
    [items]
  );

  const toggle = useCallback(
    async (productId: number) => {
      const existing = items.find((item) => item.product.id === productId);
      if (existing) {
        await removeWishlistItem(existing.id);
      } else {
        await addWishlistItem(productId);
      }
      await refresh();
    },
    [items, refresh]
  );

  return (
    <WishlistContext.Provider
      value={{
        items,
        count: items.length,
        loading,
        error,
        isSaved,
        toggle,
        refresh,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used inside WishlistProvider");
  return ctx;
}
