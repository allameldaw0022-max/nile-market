import { ClipboardList } from "lucide-react";
import { getAllOrders } from "@/lib/queries/admin";

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  processing: "قيد التجهيز",
  ready: "جاهز للاستلام",
  out_for_delivery: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
};

export default async function AdminOrdersPage() {
  const items = await getAllOrders();

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">كل الطلبات</h1>

      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <ClipboardList className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد طلبات بعد.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5">
          {items.map((item) => {
            const order = item.orders as { guest_customer_name: string | null; customer_id: string | null } | null;
            return (
              <div key={item.id} className="flex items-center justify-between p-3.5 text-sm">
                <div>
                  <p className="font-bold text-navy">
                    {(item.products as { name: string } | null)?.name} — {(item.stores as { name: string } | null)?.name}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {order?.guest_customer_name ? `عبر مسوّق: ${order.guest_customer_name}` : "طلب عميل مباشر"} —{" "}
                    {item.quantity} × {item.unit_price.toLocaleString("ar")} SDG
                  </p>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600 shrink-0">
                  {STATUS_LABELS[item.status] ?? item.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
