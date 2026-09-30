import { getDb } from "@/lib/db";
import { apiError, guardAdmin, ok, readJson, serverError } from "@/lib/http";
import { resetEvent } from "@/lib/queries";
import { firstIssue, resetSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Deletes every booking and sets the new event week, in one transaction. */
export async function POST(req: Request) {
  const denied = await guardAdmin(req);
  if (denied) return denied;
  const parsed = resetSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("invalid", firstIssue(parsed.error), 400);
  try {
    const deleted = await resetEvent(getDb(), parsed.data.mondayUtc);
    return ok({ deleted, mondayUtc: parsed.data.mondayUtc });
  } catch (err) {
    return serverError(err);
  }
}
