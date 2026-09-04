"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type OrderStatus = Database["public"]["Enums"]["order_status"];

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "pending", label: "قيد الانتظار" },
  { value: "processing", label: "قيد التجهيز" },
  { value: "ready", label: "جاهز للاستلام" },
  { value: "out_for_delivery", label: "في الطريق" },
  { value: "delivered", label: "تم التوصيل" },
  { value: "cancelled", label: "ملغي" },
];

export type SellerOrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  status: OrderStatus;
  created_at: string;
  products: { name: string } | null;
  orders: { delivery_address: unknown; customer_id: string } | null;
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

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-navy">{item.products?.name}</p>
          <p className="text-xs text-neutral-400">
            الكمية: {item.quantity} — {(item.unit_price * item.quantity).toLocaleString("ar")} SDG
          </p>
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
    </div>
  );
}
