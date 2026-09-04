import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/queries";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main className="flex-1 max-w-md mx-auto w-full p-6">
      <h1 className="font-bold text-xl text-navy mb-4">حسابي</h1>
      <div className="bg-white rounded-2xl border border-black/5 p-4 space-y-2 text-sm">
        <p>
          <span className="text-neutral-400">الاسم:</span> {user.fullName ?? "—"}
        </p>
        <p>
          <span className="text-neutral-400">البريد الإلكتروني:</span> {user.email}
        </p>
        <p>
          <span className="text-neutral-400">نوع الحساب:</span>{" "}
          {user.role === "seller" ? "تاجر" : user.role === "admin" ? "إدارة" : "عميل"}
        </p>
      </div>
    </main>
  );
}
