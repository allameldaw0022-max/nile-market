"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function WithdrawalForm({ availableBalance }: { availableBalance: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState(availableBalance > 0 ? String(availableBalance) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("أدخل مبلغًا صحيحًا.");
      return;
    }
    if (value > availableBalance) {
      setError("المبلغ أكبر من رصيدك القابل للسحب.");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error: insertError } = await supabase
      .from("marketer_withdrawal_requests")
      .insert({ marketer_id: user.id, amount: value });
    setLoading(false);
    if (insertError) {
      setError("تعذّر إرسال الطلب. حاول مرة أخرى.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="bg-primary/10 text-primary rounded-2xl p-4 text-sm text-center">
        تم إرسال طلب السحب، بانتظار مراجعة الإدارة.
      </div>
    );
  }

  if (availableBalance <= 0) {
    return <p className="text-sm text-neutral-400 text-center">لا يوجد رصيد قابل للسحب حاليًا.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/5 p-4 space-y-3">
      <p className="text-sm font-bold text-navy">طلب سحب</p>
      <input
        type="number"
        min="1"
        max={availableBalance}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
      >
        {loading ? "..." : "إرسال طلب السحب"}
      </button>
    </form>
  );
}
