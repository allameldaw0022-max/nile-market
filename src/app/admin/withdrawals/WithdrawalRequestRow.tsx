"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Store, Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type WalletOwnerType = Database["public"]["Enums"]["wallet_owner_type"];

export type WithdrawalRow = {
  id: string;
  owner_type: WalletOwnerType;
  amount: number;
  payout_details: string | null;
  created_at: string;
  ownerName: string;
  payout_methods: { name: string } | null;
};

const OWNER_META: Record<string, { label: string; icon: typeof Store }> = {
  seller: { label: "متجر", icon: Store },
  marketer: { label: "مسوّق", icon: Megaphone },
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
    const { error: rpcError } = await supabase.rpc("reject_withdrawal_request", { p_request_id: request.id });
    setBusy(false);
    if (rpcError) {
      setError("تعذّر الرفض.");
      return;
    }
    setHandled(true);
    router.refresh();
  }

  if (handled) return null;

  const meta = OWNER_META[request.owner_type];

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <meta.icon size={14} className="text-neutral-400" />
          <p className="text-sm font-bold text-navy">{request.ownerName}</p>
          <span className="text-[10px] text-neutral-400">({meta.label})</span>
        </div>
        <span className="text-primary font-extrabold text-sm">{request.amount.toLocaleString("ar")} SDG</span>
      </div>
      <p className="text-xs text-neutral-400 mt-1.5">
        {request.payout_methods?.name} — {request.payout_details}
      </p>
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
