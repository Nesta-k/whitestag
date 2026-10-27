"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Activity, Boxes, CarFront, ClipboardList, FileText, LayoutDashboard, Menu, X } from "lucide-react";

const navigation = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/products", label: "Inventory", icon: CarFront },
  { href: "/admin/orders", label: "Demo orders", icon: ClipboardList },
  { href: "/admin/enquiries", label: "Enquiries", icon: FileText },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const syncPathname = () => setPathname(window.location.pathname);
    syncPathname();
    window.addEventListener("popstate", syncPathname);
    return () => window.removeEventListener("popstate", syncPathname);
  }, []);
  const pageLabel = navigation.find((item) => item.href === pathname)?.label || (pathname.includes("products") ? "Inventory" : "Owner dashboard");
  return (
    <div className="admin-app">
      {mobileOpen && <button className="admin-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`admin-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="admin-brand-row"><Link href="/" className="brand-mark"><span className="brand-symbol">W</span><span className="brand-name">WhiteStag<span> OWNER CONSOLE</span></span></Link><button type="button" className="admin-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
        <div className="admin-nav-label">Workspace</div>
        <nav className="admin-nav" aria-label="Owner dashboard navigation">
          {navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href || (href !== "/admin" && pathname.startsWith(href)) ? "active" : ""} onClick={() => { setPathname(href); setMobileOpen(false); }}><Icon size={17} /><span>{label}</span>{label === "Inventory" && <Boxes size={13} className="nav-tail" />}</Link>)}
        </nav>
        <div className="admin-sidebar-foot"><span className="admin-status-dot" />Demo environment <span>v0.1</span></div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar"><button type="button" className="admin-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={19} /></button><div><span className="admin-breadcrumb">WHITESTAG / OWNER</span><strong>{pageLabel}</strong></div><Link href="/" className="admin-view-site">View storefront <Activity size={14} /></Link></header>
        <div className="admin-demo-notice"><strong>DEMO MODE</strong><span>This dashboard is not protected by production authentication. Changes are stored only in this browser.</span></div>
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}