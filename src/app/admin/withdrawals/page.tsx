import { Wallet } from "lucide-react";
import { getPendingWithdrawalRequests } from "@/lib/queries/admin";
import { WithdrawalRequestRow, type WithdrawalRow } from "./WithdrawalRequestRow";

export default async function AdminWithdrawalsPage() {
  const requests = (await getPendingWithdrawalRequests()) as unknown as WithdrawalRow[];

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">طلبات سحب المسوّقين</h1>

      {requests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Wallet className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد طلبات سحب بانتظار المراجعة.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((request) => (
            <WithdrawalRequestRow key={request.id} request={request} />
          ))}
        </div>
      )}
    </main>
  );
}
