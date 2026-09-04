"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Plan = {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  is_active: boolean;
};

export function PlanRow({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [active, setActive] = useState(plan.is_active);
  const [saving, setSaving] = useState(false);

  async function toggleActive() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("subscription_plans").update({ is_active: !active }).eq("id", plan.id);
    setSaving(false);
    if (!error) {
      setActive(!active);
      router.refresh();
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-bold text-navy">{plan.name}</p>
        <p className="text-xs text-neutral-400">
          {plan.price.toLocaleString("ar")} SDG — {plan.duration_days === 365 ? "سنوي" : "شهري"}
        </p>
      </div>
      <button
        disabled={saving}
        onClick={toggleActive}
        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 ${
          active ? "bg-primary/10 text-primary" : "bg-neutral-100 text-neutral-500"
        }`}
      >
        {active ? "مفعّلة" : "معطّلة"}
      </button>
    </div>
  );
}
