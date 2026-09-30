import { getDb } from "@/lib/db";
import { hashIp, hashToken, newEditToken } from "@/lib/auth";
import { RATE_LIMIT_PER_10_MIN } from "@/lib/config";
import { apiError, clientIp, ok, readJson, sameOrigin, serverError } from "@/lib/http";
import { countRecentByIp, createBooking } from "@/lib/queries";
import { createBookingSchema, firstIssue } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError("forbidden", "Cross-origin request refused.", 403);

  const parsed = createBookingSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("invalid", firstIssue(parsed.error), 400);

  try {
    const db = getDb();
    const ipHash = hashIp(clientIp(req));
    if ((await countRecentByIp(db, ipHash)) >= RATE_LIMIT_PER_10_MIN) {
      return apiError(
        "rate_limited",
        "Too many bookings from your network in the last minutes. Wait a little and try again.",
        429,
      );
    }

    const editToken = newEditToken();
    const result = await createBooking(db, parsed.data, hashToken(editToken), ipHash);
    if (!result.ok) {
      return result.reason === "slot_taken"
        ? apiError("slot_taken", "This slot has just been confirmed for someone else. Pick another one.", 409)
        : apiError(
            "already_booked",
            "This game ID already has an active booking for this position. Withdraw it first to pick another slot.",
            409,
          );
    }
    return ok({ booking: result.booking, editToken }, 201);
  } catch (err) {
    return serverError(err);
  }
}
