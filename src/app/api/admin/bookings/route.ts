import { getDb } from "@/lib/db";
import { hashToken, newEditToken } from "@/lib/auth";
import { apiError, guardAdmin, ok, readJson, serverError } from "@/lib/http";
import { registerBooking } from "@/lib/queries";
import { adminCreateBookingSchema, firstIssue } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Authoritative registration of a player on a slot: created as confirmed,
 * pending requests on the same slot are rejected.
 */
export async function POST(req: Request) {
  const denied = await guardAdmin(req);
  if (denied) return denied;

  const parsed = adminCreateBookingSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("invalid", firstIssue(parsed.error), 400);

  try {
    // Nobody holds the edit token of an admin-registered booking: only admins can remove it.
    const result = await registerBooking(getDb(), parsed.data, hashToken(newEditToken()));
    if (!result.ok) {
      return result.reason === "slot_taken"
        ? apiError("slot_taken", "This slot already has a confirmed booking. Reject it first, then register the player.", 409)
        : apiError(
            "already_booked",
            "This game ID already has an active request for this position. Confirm or reject that request instead, or delete it before registering the player here.",
            409,
          );
    }
    return ok({ booking: result.booking, rejected: result.rejected }, 201);
  } catch (err) {
    return serverError(err);
  }
}
