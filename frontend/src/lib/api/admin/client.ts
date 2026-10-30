const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * The dashboard keeps its own token slot so a staff session never collides with
 * the storefront customer session (`ws_token`).
 */
export const STAFF_TOKEN_KEY = "ws_staff_token";
export const STAFF_IDENTITY_KEY = "ws_staff_identity";

export class AdminApiError extends Error {
  constructor(
    public status: number,
    public data: unknown,
    message?: string,
  ) {
    super(message ?? `API error ${status}`);
    this.name = "AdminApiError";
  }
}

export function getStaffToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STAFF_TOKEN_KEY);
}

export interface AdminRequestOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
}

export async function adminFetch<T>(
  path: string,
  options: AdminRequestOptions = {},
): Promise<T> {
  const token = getStaffToken();
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  if (token) headers.Authorization = `Token ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });

  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = await res.text();
    }
    throw new AdminApiError(res.status, data);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function adminGet<T>(path: string): Promise<T> {
  return adminFetch<T>(path);
}

export function adminPost<T>(path: string, body?: unknown): Promise<T> {
  return adminFetch<T>(path, { method: "POST", body: body ?? {} });
}

export function adminPatch<T>(path: string, body: unknown): Promise<T> {
  return adminFetch<T>(path, { method: "PATCH", body });
}

export function adminDelete(path: string): Promise<void> {
  return adminFetch<void>(path, { method: "DELETE" });
}

export function buildQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  const query = qs.toString();
  return query ? `?${query}` : "";
}

/** Creates a UUID for the backend's Idempotency-Key header contract. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Turns any thrown error into a readable message, preferring Django REST
 * Framework's `detail` / field errors.
 */
export function describeAdminError(error: unknown): string {
  if (error instanceof AdminApiError) {
    const data = error.data;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      if (typeof record.detail === "string") return record.detail;
      const parts: string[] = [];
      for (const [field, value] of Object.entries(record)) {
        if (Array.isArray(value)) {
          parts.push(`${field}: ${value.join(" ")}`);
        } else if (typeof value === "string") {
          parts.push(`${field}: ${value}`);
        }
      }
      if (parts.length) return parts.join("\n");
    }
    if (error.status === 403) return "You do not have permission to do that.";
    if (error.status === 401) return "Your session has expired. Please sign in again.";
    return `Request failed (${error.status}).`;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
