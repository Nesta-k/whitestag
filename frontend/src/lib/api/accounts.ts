import { apiFetch, apiPost } from "./client";
import type { AuthToken } from "@/types/api";

export function register(payload: {
  email: string;
  password: string;
  password_confirm: string;
}): Promise<AuthToken> {
  return apiPost<AuthToken>("/api/accounts/register/", payload);
}

export function login(credentials: {
  email: string;
  password: string;
}): Promise<AuthToken> {
  return apiPost<AuthToken>("/api/accounts/login/", credentials);
}

export function googleLogin(credential: string): Promise<AuthToken> {
  return apiPost<AuthToken>("/api/accounts/google/", { credential });
}

export function logout(): Promise<void> {
  return apiPost<void>("/api/accounts/logout/", {});
}

export function getMe(): Promise<AuthToken["customer"]> {
  return apiFetch<AuthToken["customer"]>("/api/accounts/me/");
}
