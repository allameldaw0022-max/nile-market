import { notFound, redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  processing: "قيد التجهيز",
  ready: "جاهز للاستلام",
  out_for_delivery: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
};

export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!order) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select("id, quantity, unit_price, status, products(name)")
    .eq("order_id", id);

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full p-4">
      <div className="text-center py-6">
        <CheckCircle2 className="mx-auto text-primary mb-2" size={40} />
        <h1 className="font-bold text-lg text-navy">تم استلام طلبك</h1>
        <p className="text-xs text-neutral-400">رقم الطلب #{order.id.slice(0, 8)}</p>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 divide-y divide-black/5">
        {(items ?? []).map((item) => (
          <div key={item.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <p className="font-bold text-navy">{(item.products as { name: string } | null)?.name}</p>
              <p className="text-xs text-neutral-400">
                الكمية: {item.quantity} — {STATUS_LABELS[item.status] ?? item.status}
              </p>
            </div>
            <span className="font-bold text-primary">{(item.unit_price * item.quantity).toLocaleString("ar")} SDG</span>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-black/5 p-4 mt-3 space-y-1 text-sm">
        <div className="flex justify-between text-neutral-500">
          <span>المجموع الفرعي</span>
          <span>{order.subtotal.toLocaleString("ar")} SDG</span>
        </div>
        <div className="flex justify-between text-neutral-500">
          <span>رسوم التوصيل</span>
          <span>{order.delivery_fee.toLocaleString("ar")} SDG</span>
        </div>
        <div className="flex justify-between font-extrabold text-navy text-base pt-1">
          <span>الإجمالي</span>
          <span>{order.total.toLocaleString("ar")} SDG</span>
        </div>
      </div>
    </main>
  );
}
