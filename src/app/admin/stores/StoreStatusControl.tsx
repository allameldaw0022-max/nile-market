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
  store: { id: string; name: string; slug: string; status: StoreStatus; created_at: string };
}) {
  const router = useRouter();
  const [status, setStatus] = useState(store.status);
  const [saving, setSaving] = useState(false);

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
