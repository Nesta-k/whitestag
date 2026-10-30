"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/store/auth-context";
import { CartProvider } from "@/store/cart-context";
import { WishlistProvider } from "@/store/wishlist-context";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WishlistProvider>
        <CartProvider>{children}</CartProvider>
      </WishlistProvider>
    </AuthProvider>
  );
}
