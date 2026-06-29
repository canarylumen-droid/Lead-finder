import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export async function apiRequest(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ message: r.statusText }));
    throw new Error((err as { message?: string }).message ?? "Request failed");
  }
  return r;
}
