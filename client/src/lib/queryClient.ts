import { QueryClient, QueryFunction } from "@tanstack/react-query";

// API base URL resolution order:
//   1. VITE_API_BASE_URL env var (set in Netlify) — e.g. "https://api.kpi.mytennesseehomesolution.com"
//   2. __PORT_5000__ token (replaced by deploy_website on Perplexity hosting)
//   3. Empty string — same-origin (local dev / single-origin deploys)
const VITE_API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || "";
const API_BASE = VITE_API_BASE
  ? VITE_API_BASE.replace(/\/$/, "") // strip trailing slash
  : "__PORT_5000__".startsWith("__")
  ? ""
  : "__PORT_5000__";

// ─── Token storage (in-memory, survives across re-renders) ──────────
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

// ─── Helpers ────────────────────────────────────────────────────────

function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = getAuthHeaders(
    data ? { "Content-Type": "application/json" } : undefined
  );

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      headers: getAuthHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),
      refetchOnWindowFocus: true,
      staleTime: 60 * 1000, // 60 seconds
      retry: (failureCount, error: any) => {
        if (error?.message?.includes("401")) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
