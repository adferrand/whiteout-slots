import { getDb } from "@/lib/db";
import { hashToken } from "@/lib/auth";
import { apiError, ok, parseId, sameOrigin, serverError } from "@/lib/http";
import { withdrawBooking } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** A player withdraws their own booking, proving ownership with the edit token. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(req)) return apiError("forbidden", "Cross-origin request refused.", 403);
  const id = parseId((await params).id);
  const token = req.headers.get("x-edit-token");
  if (!id || !token) return apiError("invalid", "Missing booking or token.", 400);

  try {
    const done = await withdrawBooking(getDb(), id, hashToken(token));
    if (!done) {
      return apiError(
        "not_found",
        "This booking cannot be withdrawn from this browser. Ask an admin to remove it.",
        404,
      );
    }
    return ok({ withdrawn: true });
  } catch (err) {
    return serverError(err);
  }
}
