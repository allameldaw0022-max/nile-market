import { Users } from "lucide-react";
import { getCustomers } from "@/lib/queries/admin";

export default async function AdminCustomersPage() {
  const customers = await getCustomers();

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">العملاء ({customers.length})</h1>

      {customers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Users className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا يوجد عملاء مسجّلون بعد.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5">
          {customers.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3.5 text-sm">
              <div>
                <p className="font-bold text-navy">{c.full_name ?? "—"}</p>
                <p className="text-xs text-neutral-400">{c.phone ?? "بدون رقم هاتف"}</p>
              </div>
              <span className="text-xs text-neutral-400">{new Date(c.created_at).toLocaleDateString("ar")}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
