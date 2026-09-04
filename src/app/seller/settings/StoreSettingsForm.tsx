"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Store = {
  id: string;
  name: string;
  description: string | null;
  marketer_commission_rate: number;
  marketer_payout_cycle: string;
};

export function StoreSettingsForm({ store }: { store: Store }) {
  const router = useRouter();
  const [description, setDescription] = useState(store.description ?? "");
  const [commissionRate, setCommissionRate] = useState(String(store.marketer_commission_rate));
  const [payoutCycle, setPayoutCycle] = useState<"daily" | "weekly" | "per_order">(
    store.marketer_payout_cycle as "daily" | "weekly" | "per_order"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("stores")
      .update({
        description: description.trim() || null,
        marketer_commission_rate: Number(commissionRate),
        marketer_payout_cycle: payoutCycle,
      })
      .eq("id", store.id);
    setLoading(false);
    if (updateError) {
      setError("تعذّر حفظ الإعدادات.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/5 p-4 space-y-4">
      <div>
        <label className="block text-xs font-bold text-neutral-500 mb-1.5">وصف المتجر</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary resize-none"
        />
      </div>

      <div className="border-t border-black/5 pt-4">
        <p className="text-sm font-bold text-navy mb-3">إعدادات مسوّقي المتجر</p>

        <label className="block text-xs font-bold text-neutral-500 mb-1.5">نسبة العمولة (%)</label>
        <input
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={commissionRate}
          onChange={(e) => setCommissionRate(e.target.value)}
          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary mb-3"
        />

        <label className="block text-xs font-bold text-neutral-500 mb-1.5">دورة دفع العمولة</label>
        <select
          value={payoutCycle}
          onChange={(e) => setPayoutCycle(e.target.value as typeof payoutCycle)}
          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
        >
          <option value="per_order">عند كل طلب مكتمل</option>
          <option value="daily">يوميًا</option>
          <option value="weekly">أسبوعيًا</option>
        </select>
      </div>

      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
      {saved && <p className="text-xs text-primary font-bold">تم الحفظ.</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-white font-bold py-2.5 rounded-xl disabled:opacity-50"
      >
        {loading ? "..." : "حفظ الإعدادات"}
      </button>
    </form>
  );
}
