"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type OrderStatus = Database["public"]["Enums"]["order_status"];
type OrderSource = Database["public"]["Enums"]["order_source"];

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "قيد الانتظار" },
  { value: "processing", label: "قيد التجهيز" },
  { value: "ready", label: "جاهز للاستلام" },
  { value: "out_for_delivery", label: "في الطريق" },
  { value: "delivered", label: "تم التوصيل" },
  { value: "cancelled", label: "ملغي" },
];

const SOURCE_LABELS: Record<OrderSource, string> = {
  direct: "طلب عميل مباشر",
  affiliate_link: "عن طريق رابط مسوّق",
  affiliate_assisted: "سجّله المسوّق للعميل",
};

export type SellerOrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  status: OrderStatus;
  order_source: OrderSource;
  marketer_id: string | null;
  commission_amount: number;
  platform_commission_amount: number;
  created_at: string;
  products: { name: string } | null;
  orders: {
    delivery_address: unknown;
    customer_id: string | null;
    guest_customer_name: string | null;
    guest_customer_phone: string | null;
  } | null;
  profiles: { full_name: string | null } | null;
};

export function OrderItemRow({ item }: { item: SellerOrderItem }) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(item.status);
  const [saving, setSaving] = useState(false);

  async function updateStatus(next: OrderStatus) {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("order_items").update({ status: next }).eq("id", item.id);
    setSaving(false);
    if (!error) {
      setStatus(next);
      router.refresh();
    }
  }

  const address = item.orders?.delivery_address as { state?: string; city?: string; details?: string } | null;
  const customerLabel = item.orders?.guest_customer_name
    ? `${item.orders.guest_customer_name} — ${item.orders.guest_customer_phone}`
    : "عميل مسجّل";
  const netToSeller =
    item.unit_price * item.quantity - item.commission_amount - item.platform_commission_amount;

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-navy">{item.products?.name}</p>
          <p className="text-xs text-neutral-400">
            الكمية: {item.quantity} — {(item.unit_price * item.quantity).toLocaleString("ar")} SDG
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            صافي لك: <span className="font-bold text-primary">{netToSeller.toLocaleString("ar")} SDG</span>
            {item.platform_commission_amount > 0 && (
              <span> (بعد عمولة المنصة {item.platform_commission_amount.toLocaleString("ar")} SDG)</span>
            )}
          </p>
          <p className="text-xs text-neutral-400 mt-1">{customerLabel}</p>
          {address && (
            <p className="text-xs text-neutral-400 mt-1">
              {address.state} — {address.city} {address.details ? `— ${address.details}` : ""}
            </p>
          )}
        </div>
        <select
          value={status}
          disabled={saving}
          onChange={(e) => updateStatus(e.target.value as OrderStatus)}
          className="text-xs font-bold rounded-xl border border-black/10 px-2.5 py-2 outline-none focus:border-primary shrink-0"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {item.marketer_id && (
        <div className="flex items-center gap-1.5 bg-gold/10 text-gold-dark text-[11px] font-bold px-2.5 py-1.5 rounded-xl mt-2">
          <Megaphone size={12} />
          {SOURCE_LABELS[item.order_source]} — {item.profiles?.full_name ?? "مسوّق"} — عمولة{" "}
          {item.commission_amount.toLocaleString("ar")} SDG
        </div>
      )}
    </div>
  );
}
