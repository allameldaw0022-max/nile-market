import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { getMyStoreContext } from "@/lib/queries/seller";
import { getWalletBalance, getWalletLedger, getActivePayoutMethods, getMyWithdrawalRequests } from "@/lib/queries/wallet";
import { WithdrawalRequestForm } from "@/components/wallet/WithdrawalRequestForm";
import { WalletLedgerList } from "@/components/wallet/WalletLedgerList";

export default async function SellerWalletPage() {
  const context = await getMyStoreContext();
  if (!context || !context.isOwner) redirect("/seller");
  const { store } = context;

  const [balance, ledger, payoutMethods, withdrawals] = await Promise.all([
    getWalletBalance("seller", store.id),
    getWalletLedger("seller", store.id),
    getActivePayoutMethods(),
    getMyWithdrawalRequests("seller", store.id),
  ]);

  const hasPending = withdrawals.some((w) => w.status === "pending" || w.status === "approved");

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">محفظة متجري</h1>

      <div className="bg-navy rounded-2xl p-5 text-center mb-4">
        <Wallet className="mx-auto text-gold mb-1.5" size={22} />
        <p className="font-extrabold text-white text-2xl">{balance.toLocaleString("ar")}</p>
        <p className="text-[11px] text-white/60">رصيدك القابل للسحب (SDG)</p>
      </div>

      {hasPending ? (
        <div className="bg-amber-500/10 text-amber-700 rounded-2xl p-4 text-sm text-center mb-4">
          لديك طلب سحب قيد المراجعة حاليًا.
        </div>
      ) : (
        <WithdrawalRequestForm
          ownerType="seller"
          ownerId={store.id}
          availableBalance={balance}
          payoutMethods={payoutMethods}
        />
      )}

      {withdrawals.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-bold text-navy mb-2">سجل طلبات السحب</p>
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <div key={w.id} className="bg-white rounded-2xl border border-black/5 p-3 flex items-center justify-between text-sm">
                <span>{w.amount.toLocaleString("ar")} SDG</span>
                <span className="text-xs text-neutral-400">{w.payout_methods?.name}</span>
                <span className="text-[11px] font-bold text-neutral-500">{w.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="text-sm font-bold text-navy mb-2">سجل الحركات المالية</p>
        <WalletLedgerList rows={ledger} />
      </div>
    </main>
  );
}
