import { getDb } from "@/lib/db";
import { apiError, guardAdmin, ok, readJson, serverError } from "@/lib/http";
import { setMondayUtc } from "@/lib/queries";
import { firstIssue, settingsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Changes the event week without touching bookings. */
export async function PATCH(req: Request) {
  const denied = await guardAdmin(req);
  if (denied) return denied;
  const parsed = settingsSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("invalid", firstIssue(parsed.error), 400);
  try {
    await setMondayUtc(getDb(), parsed.data.mondayUtc);
    return ok({ mondayUtc: parsed.data.mondayUtc });
  } catch (err) {
    return serverError(err);
  }
}
