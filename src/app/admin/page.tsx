import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/queries";

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/account");

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full p-6">
      <h1 className="font-bold text-xl text-navy mb-2">لوحة الإدارة</h1>
      <p className="text-sm text-neutral-500">قيد الإنشاء — سيتم بناؤها في مرحلة لاحقة.</p>
    </main>
  );
}
