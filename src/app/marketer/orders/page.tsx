import { ClipboardList } from "lucide-react";
import { getMarketerOrderItems } from "@/lib/queries/marketer";

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  processing: "قيد التجهيز",
  ready: "جاهز للاستلام",
  out_for_delivery: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
};

export default async function MarketerOrdersPage() {
  const items = await getMarketerOrderItems();

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">طلباتي</h1>

      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <ClipboardList className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لم تنشئ أي طلبات بعد.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl border border-black/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-navy">
                    {(item.products as { name: string } | null)?.name} — {(item.stores as { name: string } | null)?.name}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {item.orders?.guest_customer_name} — {item.orders?.guest_customer_phone}
                  </p>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600 shrink-0">
                  {STATUS_LABELS[item.status] ?? item.status}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-neutral-400">
                <span>
                  {item.quantity} × {item.unit_price.toLocaleString("ar")} SDG
                </span>
                <span className="font-bold text-primary">
                  عمولة: {item.commission_amount.toLocaleString("ar")} SDG
                  {item.commission_paid ? " (مدفوعة)" : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
