import { getDb } from "@/lib/db";
import { toCsv, toText } from "@/lib/export";
import { apiError, guardAdmin, serverError } from "@/lib/http";
import { getMondayUtc, listForExport } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/export?scope=schedule|full&format=csv|text
 * schedule = confirmed bookings only; full = every status incl. speedup days.
 * `text` is only available for the schedule (paste into Discord or in-game chat).
 */
export async function GET(req: Request) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") === "full" ? "full" : "schedule";
  const format = url.searchParams.get("format") === "text" ? "text" : "csv";
  if (format === "text" && scope === "full") {
    return apiError("invalid", "Text export is only available for the schedule.", 400);
  }

  try {
    const db = getDb();
    const [mondayUtc, rows] = await Promise.all([getMondayUtc(db), listForExport(db, scope)]);
    const body = format === "text" ? toText(rows, mondayUtc) : toCsv(rows, mondayUtc, scope);
    const ext = format === "text" ? "txt" : "csv";
    const type = format === "text" ? "text/plain" : "text/csv";
    return new Response(body, {
      headers: {
        "Content-Type": `${type}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="ministers-${mondayUtc}-${scope}.${ext}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
