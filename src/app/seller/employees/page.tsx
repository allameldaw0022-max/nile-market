import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { getMyStore } from "@/lib/queries/seller";
import { createClient } from "@/lib/supabase/server";
import { AddEmployeeForm } from "./AddEmployeeForm";
import { EmployeeRow } from "./EmployeeRow";

export default async function SellerEmployeesPage() {
  const store = await getMyStore();
  if (!store) redirect("/seller");

  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("store_employees")
    .select("id, created_at, profiles(full_name)")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">موظفو المتجر</h1>

      <div className="bg-white rounded-2xl border border-black/5 p-4 mb-4">
        <p className="text-sm font-bold text-navy mb-3">إضافة موظف</p>
        <p className="text-xs text-neutral-400 mb-3">
          الموظف يجب أن يملك حسابًا مسجّلاً في سوق النيل مسبقًا (أي نوع حساب). أدخل بريده الإلكتروني.
        </p>
        <AddEmployeeForm storeId={store.id} />
      </div>

      {!employees || employees.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Users className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا يوجد موظفون بعد.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {employees.map((employee) => (
            <EmployeeRow key={employee.id} employee={employee} />
          ))}
        </div>
      )}
    </main>
  );
}
