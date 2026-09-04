import { Wallet, Clock, CheckCircle2 } from "lucide-react";
import { getMarketerEarningsSummary } from "@/lib/queries/marketer";
import { createClient } from "@/lib/supabase/server";
import { WithdrawalForm } from "./WithdrawalForm";

export default async function MarketerEarningsPage() {
  const summary = await getMarketerEarningsSummary();

  const supabase = await createClient();
  const { data: withdrawals } = await supabase
    .from("marketer_withdrawal_requests")
    .select("id, amount, status, created_at")
    .order("created_at", { ascending: false });

  const hasPending = (withdrawals ?? []).some((w) => w.status === "pending" || w.status === "approved");

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">أرباحي</h1>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white rounded-2xl border border-black/5 p-3 text-center">
          <Clock className="mx-auto text-amber-500 mb-1" size={18} />
          <p className="font-extrabold text-navy text-sm">{summary.pending.toLocaleString("ar")}</p>
          <p className="text-[10px] text-neutral-400">معلّقة</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 p-3 text-center">
          <Wallet className="mx-auto text-primary mb-1" size={18} />
          <p className="font-extrabold text-navy text-sm">{summary.earnedUnpaid.toLocaleString("ar")}</p>
          <p className="text-[10px] text-neutral-400">قابلة للسحب</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 p-3 text-center">
          <CheckCircle2 className="mx-auto text-neutral-400 mb-1" size={18} />
          <p className="font-extrabold text-navy text-sm">{summary.paid.toLocaleString("ar")}</p>
          <p className="text-[10px] text-neutral-400">مدفوع سابقًا</p>
        </div>
      </div>

      {hasPending ? (
        <div className="bg-amber-500/10 text-amber-700 rounded-2xl p-4 text-sm text-center mb-4">
          لديك طلب سحب قيد المراجعة حاليًا.
        </div>
      ) : (
        <WithdrawalForm availableBalance={summary.earnedUnpaid} />
      )}

      {withdrawals && withdrawals.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-bold text-navy mb-2">سجل طلبات السحب</p>
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <div key={w.id} className="bg-white rounded-2xl border border-black/5 p-3 flex items-center justify-between text-sm">
                <span>{w.amount.toLocaleString("ar")} SDG</span>
                <span className="text-xs text-neutral-400">{new Date(w.created_at).toLocaleDateString("ar")}</span>
                <span className="text-[11px] font-bold text-neutral-500">{w.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
