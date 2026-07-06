import type { Asset, AssetRequest, Category, CreditTransaction, Notification, User } from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8080/api");

export type AuthResponse = {
  token: string;
  user: User;
};

export type AssetResponse = {
  assets: Asset[];
};

export type SingleAssetResponse = {
  asset: Asset;
};

export type CategoriesResponse = {
  categories: Category[];
};

export type RequestsResponse = {
  requests: AssetRequest[];
};

export type NotificationsResponse = {
  notifications: Notification[];
};

export type TransactionsResponse = {
  transactions: CreditTransaction[];
};

export type StatsResponse = {
  stats: Record<string, number>;
};

export function getToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem("lch_token");
}

export function saveSession(response: AuthResponse) {
  window.localStorage.setItem("lch_token", response.token);
  window.localStorage.setItem("lch_user", JSON.stringify(response.user));
}

export function clearSession() {
  window.localStorage.removeItem("lch_token");
  window.localStorage.removeItem("lch_user");
}

export function readSavedUser(): User | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem("lch_user");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      message = payload.error ?? message;
    } catch {
      // Use the status message when the API does not return JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
