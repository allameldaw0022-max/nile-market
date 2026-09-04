"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Plan = { id: string; name: string; price: number; duration_days: number };

export function SubscriptionRequestForm({ storeId, plans }: { storeId: string; plans: Plan[] }) {
  const router = useRouter();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [proofUrl, setProofUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selectedPlan = plans.find((p) => p.id === planId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPlan) {
      setError("اختر باقة أولاً.");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("subscription_requests").insert({
      store_id: storeId,
      plan_id: selectedPlan.id,
      amount: selectedPlan.price,
      payment_proof_url: proofUrl.trim() || null,
    });
    setLoading(false);
    if (insertError) {
      setError("تعذّر إرسال الطلب. حاول مرة أخرى.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (plans.length === 0) {
    return <p className="text-sm text-neutral-400 text-center">لا توجد باقات متاحة حاليًا.</p>;
  }

  if (done) {
    return (
      <div className="bg-primary/10 text-primary rounded-2xl p-4 text-sm text-center">
        تم إرسال طلبك، بانتظار مراجعة الإدارة.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/5 p-4 space-y-3">
      <p className="text-sm font-bold text-navy">طلب تجديد/ترقية</p>
      <select
        value={planId}
        onChange={(e) => setPlanId(e.target.value)}
        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
      >
        {plans.map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.name} — {plan.price.toLocaleString("ar")} SDG ({plan.duration_days === 365 ? "سنوي" : "شهري"})
          </option>
        ))}
      </select>
      <input
        placeholder="رابط إثبات الدفع (اختياري)"
        value={proofUrl}
        onChange={(e) => setProofUrl(e.target.value)}
        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
      >
        {loading ? "..." : "إرسال الطلب"}
      </button>
    </form>
  );
}
