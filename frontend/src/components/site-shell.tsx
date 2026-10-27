"use client";

import type { ReactNode } from "react";
import { AppProvider } from "@/components/app-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export function SiteShell({ children }: { children: ReactNode }) {
    return <AppProvider>{children}</AppProvider>;
}

export function PublicShell({ children }: { children: ReactNode }) {
    return <><SiteHeader />{children}<SiteFooter /></>;
}