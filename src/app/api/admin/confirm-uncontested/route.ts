import { getDb } from "@/lib/db";
import { guardAdmin, ok, serverError } from "@/lib/http";
import { confirmUncontested } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await guardAdmin(req);
  if (denied) return denied;
  try {
    return ok({ confirmed: await confirmUncontested(getDb()) });
  } catch (err) {
    return serverError(err);
  }
}
