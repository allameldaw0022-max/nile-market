"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PlatformSettingsForm({ defaultRate }: { defaultRate: number }) {
  const router = useRouter();
  const [rate, setRate] = useState(String(defaultRate));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    const value = Number(rate);
    if (Number.isNaN(value) || value < 0 || value > 100) return;
    setSaving(true);
    setSaved(false);
    const supabase = createClient();
    await supabase.from("platform_settings").update({ default_platform_commission_rate: value }).eq("id", true);
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-4 space-y-3">
      <label className="block">
        <span className="text-sm font-bold text-navy">نسبة عمولة المنصة الافتراضية %</span>
        <input
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={rate}
          onChange={(e) => {
            setRate(e.target.value);
            setSaved(false);
          }}
          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary mt-1.5"
        />
      </label>
      <button
        disabled={saving}
        onClick={save}
        className="w-full bg-primary text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
      >
        {saving ? "..." : "حفظ"}
      </button>
      {saved && <p className="text-xs text-primary font-bold text-center">تم الحفظ.</p>}
    </div>
  );
}
