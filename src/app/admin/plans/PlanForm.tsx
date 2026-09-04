"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PlanForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("subscription_plans").insert({
      name: name.trim(),
      price: Number(price),
      duration_days: Number(durationDays),
    });
    setLoading(false);
    if (insertError) {
      setError("تعذّر إضافة الباقة.");
      return;
    }
    setName("");
    setPrice("");
    setDurationDays("30");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-2">
      <input
        required
        placeholder="اسم الباقة"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="col-span-3 sm:col-span-1 rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <input
        required
        type="number"
        min="0"
        placeholder="السعر (SDG)"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <select
        value={durationDays}
        onChange={(e) => setDurationDays(e.target.value)}
        className="rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
      >
        <option value="30">شهري (30 يومًا)</option>
        <option value="365">سنوي (365 يومًا)</option>
      </select>
      {error && <p className="col-span-3 text-xs text-red-500 font-bold">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="col-span-3 bg-primary text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
      >
        {loading ? "..." : "إضافة الباقة"}
      </button>
    </form>
  );
}
