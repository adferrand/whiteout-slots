import { checkPassword, startAdminSession } from "@/lib/auth";
import { apiError, ok, readJson, sameOrigin, serverError } from "@/lib/http";
import { loginSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return apiError("forbidden", "Cross-origin request refused.", 403);
  const parsed = loginSchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError("invalid", "Enter the admin password.", 400);

  try {
    if (!checkPassword(parsed.data.password)) {
      // Cheap brute-force brake on a shared-secret login.
      await new Promise((r) => setTimeout(r, 600));
      return apiError("bad_password", "Wrong password.", 401);
    }
    await startAdminSession();
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
