"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Marketer = {
  id: string;
  referral_code: string;
  is_active: boolean;
  profiles: { full_name: string | null } | null;
};

export function PlatformMarketerRow({ marketer }: { marketer: Marketer }) {
  const router = useRouter();
  const [active, setActive] = useState(marketer.is_active);
  const [saving, setSaving] = useState(false);

  async function toggleActive() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("platform_marketers")
      .update({ is_active: !active })
      .eq("id", marketer.id);
    setSaving(false);
    if (!error) {
      setActive(!active);
      router.refresh();
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-bold text-navy">{marketer.profiles?.full_name ?? "—"}</p>
        <p className="text-xs text-neutral-400 font-mono">كود الإحالة: {marketer.referral_code}</p>
      </div>
      <button
        disabled={saving}
        onClick={toggleActive}
        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 ${
          active ? "bg-primary/10 text-primary" : "bg-neutral-100 text-neutral-500"
        }`}
      >
        {active ? "نشط" : "معطّل"}
      </button>
    </div>
  );
}
