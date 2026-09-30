import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin login" };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return <LoginForm />;
}
