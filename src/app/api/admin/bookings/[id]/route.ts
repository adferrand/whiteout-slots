import { getDb } from "@/lib/db";
import { apiError, guardAdmin, ok, parseId, readJson, serverError } from "@/lib/http";
import { confirmBooking, purgeBooking, rejectBooking, restoreBooking } from "@/lib/queries";
import { adminActionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * confirm: winner of a slot (rejects the other pending bookings);
 * reject: soft removal (stays visible); restore: undo a rejection.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await guardAdmin(req);
  if (denied) return denied;
  const id = parseId((await params).id);
  const parsed = adminActionSchema.safeParse(await readJson(req));
  if (!id || !parsed.success) return apiError("invalid", "Invalid request.", 400);

  try {
    const db = getDb();
    if (parsed.data.action === "confirm") {
      const r = await confirmBooking(db, id);
      if (!r.ok) {
        return r.reason === "slot_taken"
          ? apiError("slot_taken", "This slot already has a confirmed booking. Reject that one first.", 409)
          : apiError("not_pending", "This booking is no longer pending. Refresh the view.", 409);
      }
      return ok({ confirmed: true, rejected: r.rejected });
    }
    if (parsed.data.action === "restore") {
      const r = await restoreBooking(db, id);
      if (!r.ok) {
        return r.reason === "player_active"
          ? apiError("player_active", "This player already has another active booking for this position.", 409)
          : apiError("not_rejected", "This booking is not rejected anymore. Refresh the view.", 409);
      }
      return ok({ restored: true });
    }
    const done = await rejectBooking(db, id);
    if (!done) return apiError("not_found", "Nothing to reject. Refresh the view.", 404);
    return ok({ rejected: true });
  } catch (err) {
    return serverError(err);
  }
}

/** Hard delete (spam). Regular removals should use `reject`. */
export async function DELETE(req: Request, { params }: Ctx) {
  const denied = await guardAdmin(req);
  if (denied) return denied;
  const id = parseId((await params).id);
  if (!id) return apiError("invalid", "Invalid booking.", 400);
  try {
    const done = await purgeBooking(getDb(), id);
    if (!done) return apiError("not_found", "Booking not found. Refresh the view.", 404);
    return ok({ purged: true });
  } catch (err) {
    return serverError(err);
  }
}
