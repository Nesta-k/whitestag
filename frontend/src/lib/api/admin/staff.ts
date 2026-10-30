import { adminFetch, adminGet, adminPost } from "./client";
import type { StaffIdentity, StaffLoginResponse } from "@/types/admin";

export function staffLogin(credentials: {
  email: string;
  password: string;
}): Promise<StaffLoginResponse> {
  return adminPost<StaffLoginResponse>("/api/accounts/staff-login/", credentials);
}

export function staffMe(): Promise<StaffIdentity> {
  return adminGet<StaffIdentity>("/api/accounts/staff/me/");
}

export function staffLogout(): Promise<void> {
  return adminFetch<void>("/api/accounts/logout/", { method: "POST", body: {} });
}
