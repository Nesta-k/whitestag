"use client";

import { AuthProvider } from "@/store/auth-context";
import { CartProvider } from "@/store/cart-context";
import { Header } from "./header";
import { Footer } from "./footer";

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>
        <Header />
        <main id="main-content" className="site-main">{children}</main>
        <Footer />
      </CartProvider>
    </AuthProvider>
  );
}
