"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type WithdrawalRow = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  profiles: { full_name: string | null } | null;
};

export function WithdrawalRequestRow({ request }: { request: WithdrawalRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [handled, setHandled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("mark_withdrawal_paid", { p_request_id: request.id });
    setBusy(false);
    if (rpcError) {
      setError("تعذّرت العملية.");
      return;
    }
    setHandled(true);
    router.refresh();
  }

  async function reject() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("marketer_withdrawal_requests")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", request.id);
    setBusy(false);
    if (updateError) {
      setError("تعذّر الرفض.");
      return;
    }
    setHandled(true);
    router.refresh();
  }

  if (handled) return null;

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-navy">{request.profiles?.full_name ?? "—"}</p>
        <span className="text-primary font-extrabold text-sm">{request.amount.toLocaleString("ar")} SDG</span>
      </div>
      {error && <p className="text-xs text-red-500 font-bold mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button
          disabled={busy}
          onClick={approve}
          className="flex-1 flex items-center justify-center gap-1.5 bg-primary/10 text-primary text-xs font-bold py-2.5 rounded-xl disabled:opacity-50"
        >
          <Check size={14} /> دفع وتأكيد
        </button>
        <button
          disabled={busy}
          onClick={reject}
          className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 text-red-500 text-xs font-bold py-2.5 rounded-xl disabled:opacity-50"
        >
          <X size={14} /> رفض
        </button>
      </div>
    </div>
  );
}
