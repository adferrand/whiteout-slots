import { NextResponse } from "next/server";
import { isAdmin } from "./auth";
import type { ApiErrorBody } from "./types";

export function apiError(code: string, message: string, status: number) {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Refuses cross-origin browser requests (defence in depth on top of SameSite=Strict). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Returns an error response when the caller is not an admin, otherwise null. */
export async function guardAdmin(req: Request) {
  if (req.method !== "GET" && !sameOrigin(req)) {
    return apiError("forbidden", "Cross-origin request refused.", 403);
  }
  if (!(await isAdmin())) {
    return apiError("unauthorized", "Admin login required.", 401);
  }
  return null;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export function serverError(err: unknown) {
  console.error(err);
  return apiError("server_error", "Something went wrong on the server. Try again.", 500);
}

export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
