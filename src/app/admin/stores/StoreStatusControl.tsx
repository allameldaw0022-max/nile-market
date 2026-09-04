"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type StoreStatus = Database["public"]["Enums"]["store_status"];

const STATUS_META: Record<StoreStatus, { label: string; className: string }> = {
  pending: { label: "بانتظار المراجعة", className: "bg-amber-500/10 text-amber-600" },
  active: { label: "نشط", className: "bg-primary/10 text-primary" },
  suspended: { label: "موقوف", className: "bg-red-500/10 text-red-500" },
};

export function StoreStatusControl({
  store,
}: {
  store: {
    id: string;
    name: string;
    slug: string;
    status: StoreStatus;
    platform_commission_rate: number;
    created_at: string;
  };
}) {
  const router = useRouter();
  const [status, setStatus] = useState(store.status);
  const [saving, setSaving] = useState(false);
  const [rate, setRate] = useState(String(store.platform_commission_rate));
  const [savingRate, setSavingRate] = useState(false);

  async function setStoreStatus(next: StoreStatus) {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("stores").update({ status: next }).eq("id", store.id);
    setSaving(false);
    if (!error) {
      setStatus(next);
      router.refresh();
    }
  }

  async function saveRate() {
    const value = Number(rate);
    if (Number.isNaN(value) || value < 0 || value > 100) return;
    setSavingRate(true);
    const supabase = createClient();
    await supabase.from("stores").update({ platform_commission_rate: value }).eq("id", store.id);
    setSavingRate(false);
    router.refresh();
  }

  const meta = STATUS_META[status];

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <Link href={`/store/${store.slug}`} className="text-sm font-bold text-navy hover:text-primary truncate block">
          {store.name}
        </Link>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-block mt-1 ${meta.className}`}>
          {meta.label}
        </span>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[11px] text-neutral-400">عمولة المنصة %</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-16 text-xs font-bold rounded-lg border border-black/10 px-2 py-1 outline-none focus:border-primary"
          />
          <button
            disabled={savingRate}
            onClick={saveRate}
            className="text-[11px] font-bold bg-navy/5 text-navy px-2 py-1 rounded-lg disabled:opacity-50"
          >
            حفظ
          </button>
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        {status !== "active" && (
          <button
            disabled={saving}
            onClick={() => setStoreStatus("active")}
            className="text-[11px] font-bold bg-primary/10 text-primary px-2.5 py-1.5 rounded-lg disabled:opacity-50"
          >
            تفعيل
          </button>
        )}
        {status !== "suspended" && (
          <button
            disabled={saving}
            onClick={() => setStoreStatus("suspended")}
            className="text-[11px] font-bold bg-red-50 text-red-500 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
          >
            إيقاف
          </button>
        )}
      </div>
    </div>
  );
}
