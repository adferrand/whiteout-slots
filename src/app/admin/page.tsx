import { redirect } from "next/navigation";
import { Board } from "@/components/Board";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin, minister appointments" };

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  return <Board mode="admin" />;
}
