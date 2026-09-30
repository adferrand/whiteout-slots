import { endAdminSession } from "@/lib/auth";
import { apiError, ok, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError("forbidden", "Cross-origin request refused.", 403);
  await endAdminSession();
  return ok({ ok: true });
}
