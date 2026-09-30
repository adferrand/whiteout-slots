import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getMondayUtc, listPublic } from "@/lib/queries";
import { serverError } from "@/lib/http";
import type { Overview } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Public overview. A short CDN cache turns N polling clients into roughly one
 * database query per few seconds (keeps the Neon compute mostly idle).
 * Clients bypass it after their own writes with a `?fresh=` query parameter.
 */
export async function GET() {
  try {
    const db = getDb();
    const [mondayUtc, bookings] = await Promise.all([getMondayUtc(db), listPublic(db)]);
    return NextResponse.json<Overview>(
      { mondayUtc, bookings },
      { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } },
    );
  } catch (err) {
    return serverError(err);
  }
}
