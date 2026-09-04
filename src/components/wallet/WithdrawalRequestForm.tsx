"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type WalletOwnerType = Database["public"]["Enums"]["wallet_owner_type"];
type PayoutMethod = { id: string; name: string; instructions: string | null };

export function WithdrawalRequestForm({
  ownerType,
  ownerId,
  availableBalance,
  payoutMethods,
}: {
  ownerType: WalletOwnerType;
  ownerId: string;
  availableBalance: number;
  payoutMethods: PayoutMethod[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(availableBalance > 0 ? String(availableBalance) : "");
  const [methodId, setMethodId] = useState(payoutMethods[0]?.id ?? "");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selectedMethod = payoutMethods.find((m) => m.id === methodId);

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
    if (!methodId) {
      setError("اختر طريقة استلام الأموال.");
      return;
    }
    if (!details.trim()) {
      setError("أدخل بيانات الاستلام (رقم الحساب/الهاتف).");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("request_withdrawal", {
      p_owner_type: ownerType,
      p_owner_id: ownerId,
      p_amount: value,
      p_payout_method_id: methodId,
      p_payout_details: details.trim(),
    });
    setLoading(false);
    if (rpcError) {
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

  if (payoutMethods.length === 0) {
    return (
      <p className="text-sm text-neutral-400 text-center">
        لا توجد طرق سحب متاحة حاليًا. تواصل مع الإدارة.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/5 p-4 space-y-3">
      <p className="text-sm font-bold text-navy">طلب سحب</p>
      <label className="block">
        <span className="text-xs text-neutral-400">المبلغ (SDG)</span>
        <input
          type="number"
          min="1"
          max={availableBalance}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary mt-1"
        />
      </label>
      <label className="block">
        <span className="text-xs text-neutral-400">طريقة الاستلام</span>
        <select
          value={methodId}
          onChange={(e) => setMethodId(e.target.value)}
          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary mt-1"
        >
          {payoutMethods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-neutral-400">
          {selectedMethod?.instructions ?? "بيانات الاستلام"}
        </span>
        <input
          type="text"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-primary mt-1"
        />
      </label>
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
