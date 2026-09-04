"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PayoutMethod = { id: string; name: string; instructions: string | null; is_active: boolean };

export function PayoutMethodsManager({ methods }: { methods: PayoutMethod[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addMethod(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("payout_methods").insert({ name: name.trim(), instructions: instructions.trim() || null });
    setSaving(false);
    setName("");
    setInstructions("");
    router.refresh();
  }

  async function toggleActive(id: string, next: boolean) {
    setBusyId(id);
    const supabase = createClient();
    await supabase.from("payout_methods").update({ is_active: next }).eq("id", id);
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {methods.map((m) => (
        <div key={m.id} className="bg-white rounded-2xl border border-black/5 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-navy">{m.name}</p>
            {m.instructions && <p className="text-xs text-neutral-400 mt-0.5">{m.instructions}</p>}
          </div>
          <button
            disabled={busyId === m.id}
            onClick={() => toggleActive(m.id, !m.is_active)}
            className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg shrink-0 disabled:opacity-50 ${
              m.is_active ? "bg-primary/10 text-primary" : "bg-red-50 text-red-500"
            }`}
          >
            {m.is_active ? "مفعّلة" : "معطّلة"}
          </button>
        </div>
      ))}

      <form onSubmit={addMethod} className="bg-white rounded-2xl border border-dashed border-black/10 p-4 space-y-2">
        <p className="text-sm font-bold text-navy">إضافة طريقة سحب جديدة</p>
        <input
          type="text"
          placeholder="اسم الطريقة (مثال: بنك الخرطوم)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          type="text"
          placeholder="التعليمات (اختياري)"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-navy text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
        >
          {saving ? "..." : "إضافة"}
        </button>
      </form>
    </div>
  );
}
