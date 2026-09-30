import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError("network", "Network error. Check your connection and try again.", 0);
  }
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    throw new ApiError(
      body?.error?.code ?? "error",
      body?.error?.message ?? "The request failed. Try again.",
      res.status,
    );
  }
  return body as T;
}
