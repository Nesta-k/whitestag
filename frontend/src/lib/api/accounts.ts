import { apiRequest } from "./client";
import type {
  AuthenticationResponse,
  Customer,
} from "@/types/api";

export function register(
  email: string,
  password: string,
  passwordConfirm: string,
): Promise<AuthenticationResponse> {
  return apiRequest("/accounts/register/", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      password_confirm: passwordConfirm,
    }),
  });
}

export function login(
  email: string,
  password: string,
): Promise<AuthenticationResponse> {
  return apiRequest("/accounts/login/", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function loginWithGoogle(
  credential: string,
): Promise<AuthenticationResponse> {
  return apiRequest("/accounts/google/", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export function logout(): Promise<void> {
  return apiRequest("/accounts/logout/", { method: "POST" });
}

export function getCurrentCustomer(): Promise<Customer> {
  return apiRequest("/accounts/me/");
}
