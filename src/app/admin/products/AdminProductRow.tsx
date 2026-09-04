"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type AdminProduct = {
  id: string;
  name: string;
  price: number;
  currency: string;
  status: "active" | "hidden" | "out_of_stock";
  stock: number;
  stores: { name: string } | null;
};

export function AdminProductRow({ product }: { product: AdminProduct }) {
  const router = useRouter();
  const [status, setStatus] = useState(product.status);
  const [saving, setSaving] = useState(false);

  async function toggleHidden() {
    const next = status === "hidden" ? "active" : "hidden";
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("products").update({ status: next }).eq("id", product.id);
    setSaving(false);
    if (!error) {
      setStatus(next);
      router.refresh();
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-bold text-navy">{product.name}</p>
        <p className="text-xs text-neutral-400">
          {product.stores?.name} — {product.price.toLocaleString("ar")} {product.currency}
        </p>
      </div>
      <button
        disabled={saving}
        onClick={toggleHidden}
        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 ${
          status === "hidden" ? "bg-neutral-100 text-neutral-500" : "bg-primary/10 text-primary"
        }`}
      >
        {status === "hidden" ? "مخفي — إظهار" : "نشط — إخفاء"}
      </button>
    </div>
  );
}
