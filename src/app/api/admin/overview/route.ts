import { getDb } from "@/lib/db";
import { guardAdmin, ok, serverError } from "@/lib/http";
import { getMondayUtc, listAdmin } from "@/lib/queries";
import type { AdminBooking, Overview } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await guardAdmin(req);
  if (denied) return denied;
  try {
    const db = getDb();
    const [mondayUtc, bookings] = await Promise.all([getMondayUtc(db), listAdmin(db)]);
    return ok<Overview<AdminBooking>>({ mondayUtc, bookings });
  } catch (err) {
    return serverError(err);
  }
}
