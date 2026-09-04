import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, total, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">طلباتي</h1>

      {!orders || orders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <ClipboardList className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد طلبات بعد.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex items-center justify-between bg-white rounded-2xl border border-black/5 p-4"
            >
              <div>
                <p className="text-sm font-bold text-navy">#{order.id.slice(0, 8)}</p>
                <p className="text-xs text-neutral-400">{new Date(order.created_at).toLocaleDateString("ar")}</p>
              </div>
              <span className="text-primary font-extrabold text-sm">{order.total.toLocaleString("ar")} SDG</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
