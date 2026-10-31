import type { StaffRole } from "@/types/admin";

/**
 * Role-Capability Matrix
 * ----------------------
 * Mirrors the backend permission tiers exactly:
 *
 *  - "staff"      → DRF `IsAdminUser` (any staff member: staff, admin, superadmin)
 *  - "admin"      → `IsAdminOrSuperadmin` (admin + superadmin)
 *  - "superadmin" → `IsSuperadmin` (developer only, e.g. the Django admin console)
 *
 * "manage" includes viewing. A role inherits every capability below its tier.
 */
export type CapabilityTier = "staff" | "admin" | "superadmin";

export type Capability =
  | "overview.view"
  | "products.manage"
  | "categories.manage"
  | "brands.manage"
  | "promotions.manage"
  | "homepage.manage"
  | "inventory.manage"
  | "orders.view"
  | "orders.complete"
  | "payments.view"
  | "payments.refund"
  | "delivery.view"
  | "delivery.configure"
  | "enquiries.manage"
  | "customers.view"
  | "users.manage"
  | "system.django_admin";

const CAPABILITY_TIER: Record<Capability, CapabilityTier> = {
  "overview.view": "staff",
  "products.manage": "staff",
  "categories.manage": "staff",
  "brands.manage": "staff",
  "promotions.manage": "staff",
  "homepage.manage": "staff",
  "inventory.manage": "staff",
  "orders.view": "staff",
  "orders.complete": "staff",
  "payments.view": "staff",
  "delivery.view": "staff",
  "enquiries.manage": "staff",
  "customers.view": "staff",
  "payments.refund": "admin",
  "delivery.configure": "admin",
  "users.manage": "admin",
  "system.django_admin": "superadmin",
};

const TIER_RANK: Record<CapabilityTier, number> = {
  staff: 1,
  admin: 2,
  superadmin: 3,
};

export const STAFF_ROLES: StaffRole[] = ["staff", "admin", "superadmin"];

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role === "staff" || role === "admin" || role === "superadmin";
}

export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!isStaffRole(role)) return false;
  return TIER_RANK[role] >= TIER_RANK[CAPABILITY_TIER[capability]];
}

export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case "superadmin":
      return "Superadmin";
    case "admin":
      return "Admin (Owner)";
    case "staff":
      return "Staff";
    default:
      return "Unknown";
  }
}

export interface DashboardNavItem {
  href: string;
  label: string;
  glyph: string;
  capability: Capability;
  group: "Operations" | "Catalogue" | "People" | "System";
}

export const DASHBOARD_NAV: DashboardNavItem[] = [
  { href: "/dashboard", label: "Overview", glyph: "◎", capability: "overview.view", group: "Operations" },
  { href: "/dashboard/orders", label: "Orders", glyph: "▤", capability: "orders.view", group: "Operations" },
  { href: "/dashboard/payments", label: "Payments", glyph: "₵", capability: "payments.view", group: "Operations" },
  { href: "/dashboard/inventory", label: "Inventory", glyph: "▦", capability: "inventory.manage", group: "Operations" },
  { href: "/dashboard/enquiries", label: "Product enquiries", glyph: "✉", capability: "enquiries.manage", group: "Operations" },

  { href: "/dashboard/products", label: "Products", glyph: "❒", capability: "products.manage", group: "Catalogue" },
  { href: "/dashboard/categories", label: "Categories", glyph: "❏", capability: "categories.manage", group: "Catalogue" },
  { href: "/dashboard/brands", label: "Brands", glyph: "◈", capability: "brands.manage", group: "Catalogue" },
  { href: "/dashboard/promotions", label: "Promotions", glyph: "◑", capability: "promotions.manage", group: "Catalogue" },
  { href: "/dashboard/homepage", label: "Homepage CMS", glyph: "⌂", capability: "homepage.manage", group: "Catalogue" },

  { href: "/dashboard/customers", label: "Customers", glyph: "◍", capability: "customers.view", group: "People" },
  { href: "/dashboard/users", label: "Staff & users", glyph: "◐", capability: "users.manage", group: "People" },

];

export function navForRole(role: string | null | undefined): DashboardNavItem[] {
  return DASHBOARD_NAV.filter((item) => can(role, item.capability));
}
