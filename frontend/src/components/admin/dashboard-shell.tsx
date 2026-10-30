"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useStaffAuth } from "@/store/staff-auth-context";
import { navForRole, roleLabel, type DashboardNavItem } from "@/lib/admin/capabilities";

const GROUP_ORDER: DashboardNavItem["group"][] = [
  "Operations",
  "Catalogue",
  "People",
  "System",
];

export default function DashboardShell({ children }: { children: ReactNode }) {
  const { staff, role, loading, signOut } = useStaffAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !staff) router.replace("/staff/login");
  }, [loading, staff, router]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="ws-dash-gate" role="status">
        <span className="ws-dash-spinner" aria-hidden />
        <p>Loading dashboard…</p>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="ws-dash-gate" role="status">
        <p>Redirecting to sign in…</p>
      </div>
    );
  }

  const items = navForRole(role);
  const displayName =
    [staff.first_name, staff.last_name].filter(Boolean).join(" ") || staff.email;

  return (
    <div className={`ws-dash${menuOpen ? " is-menu-open" : ""}`}>
      <aside className="ws-dash-side">
        <div className="ws-dash-brand">
          <Image
            alt=""
            className="ws-logo-mark"
            height={74}
            src="/logo.svg"
            unoptimized
            width={119}
          />
          <span className="ws-dash-brand-text">
            <strong>WhiteStag</strong>
            <small>Console</small>
          </span>
        </div>

        <nav className="ws-dash-nav" aria-label="Dashboard">
          {GROUP_ORDER.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (!groupItems.length) return null;
            return (
              <div className="ws-dash-nav-group" key={group}>
                <p className="ws-dash-nav-heading">{group}</p>
                {groupItems.map((item) => {
                  const active =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`ws-dash-nav-link${active ? " is-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="ws-dash-nav-glyph" aria-hidden>
                        {item.glyph}
                      </span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="ws-dash-side-foot">
          <Link href="/" className="ws-dash-side-link">
            View storefront
          </Link>
          {role === "superadmin" ? (
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/admin/`}
              className="ws-dash-side-link"
              target="_blank"
              rel="noreferrer"
            >
              Django admin
            </a>
          ) : null}
        </div>
      </aside>

      <div className="ws-dash-body">
        <header className="ws-dash-top">
          <button
            type="button"
            className="ws-dash-menu-toggle"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
          >
            ☰
          </button>
          <div className="ws-dash-top-user">
            <div className="ws-dash-top-identity">
              <strong>{displayName}</strong>
              <small>{staff.email}</small>
            </div>
            <span className="ws-dash-role">{roleLabel(role)}</span>
            <button
              type="button"
              className="ws-dash-btn"
              onClick={() => {
                void signOut().then(() => router.replace("/staff/login"));
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="ws-dash-main">{children}</main>
      </div>
    </div>
  );
}
