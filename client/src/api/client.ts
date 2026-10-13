// Set by vite.config.ts at build time: on a Vercel preview deployment,
// this points at the same branch's server preview (see
// VITE_PREVIEW_SERVER_URL_TEMPLATE there). Empty string outside preview
// builds.
declare const __PREVIEW_API_URL__: string;

// In local dev this is empty and requests go through Vite's /api proxy
// (see vite.config.ts) to the backend on :4000. In production the
// frontend and backend are deployed as separate Vercel projects, so
// VITE_API_URL must point at the backend's deployed URL, e.g.
// "https://coop-mvp-server.vercel.app". On a PR preview, neither is set
// and __PREVIEW_API_URL__ takes over instead.
const API_BASE_URL = import.meta.env.VITE_API_URL || __PREVIEW_API_URL__ || "";

const TOKEN_KEY = "coop_mvp_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}/api${path}`, { ...options, headers });

  if (!res.ok) {
    let message = res.statusText;
    let details: unknown;
    try {
      const body = await res.json();
      message = body.error ?? message;
      details = body.details;
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
};
