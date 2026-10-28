export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function getApiBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!configuredUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not configured. Copy frontend/.env.example to frontend/.env.local.",
    );
  }
  return configuredUrl.replace(/\/+$/, "");
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("whitestag.auth.token");
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.length > 0) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    for (const [field, value] of Object.entries(record)) {
      if (["reference", "status", "outcome", "authorization_url"].includes(field)) {
        continue;
      }
      if (typeof value === "string") return `${field}: ${value}`;
      if (Array.isArray(value) && typeof value[0] === "string") {
        return `${field}: ${value[0]}`;
      }
    }
  }
  return fallback;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");
  const token = getStoredToken();
  if (token) headers.set("Authorization", `Token ${token}`);

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Could not connect to WhiteStag. Try again shortly.", null);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown;
  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);
  } else {
    payload = await response.text().catch(() => "");
  }

  if (!response.ok) {
    const fallback =
      response.status === 401
        ? "Your session has expired. Please sign in again."
        : response.status >= 500
          ? "WhiteStag could not confirm this request. Please try again shortly."
        : `The request failed (${response.status}).`;
    throw new ApiError(response.status, errorMessage(payload, fallback), payload);
  }

  return payload as T;
}

export function idempotencyKey(): string {
  return crypto.randomUUID();
}

export function queryString(
  values: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && String(value).length > 0) {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
