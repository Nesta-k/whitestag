import { adminGet, adminPatch, adminPost, buildQuery } from "./client";
import type { PaginatedResponse } from "@/types/api";
import type { StaffCustomer, StaffUser, StaffUserPayload } from "@/types/admin";

// ─── Storefront customers (staff visible) ─────────────────────────────────────

export function listStaffCustomers(params: {
  search?: string;
  page?: number;
} = {}): Promise<PaginatedResponse<StaffCustomer>> {
  return adminGet<PaginatedResponse<StaffCustomer>>(
    `/api/accounts/staff/customers/${buildQuery({ ...params })}`,
  );
}

// ─── User management (admin/superadmin only) ──────────────────────────────────

export function listStaffUsers(params: {
  search?: string;
  role?: string;
  page?: number;
} = {}): Promise<PaginatedResponse<StaffUser>> {
  return adminGet<PaginatedResponse<StaffUser>>(
    `/api/superadmin/users/${buildQuery({ ...params })}`,
  );
}

export function createStaffUser(payload: StaffUserPayload): Promise<StaffUser> {
  return adminPost<StaffUser>("/api/superadmin/users/", payload);
}

export function updateStaffUser(
  id: number,
  payload: Partial<StaffUserPayload>,
): Promise<StaffUser> {
  return adminPatch<StaffUser>(`/api/superadmin/users/${id}/`, payload);
}
