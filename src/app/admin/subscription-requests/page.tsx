import { Receipt } from "lucide-react";
import { getPendingSubscriptionRequests } from "@/lib/queries/admin";
import { SubscriptionRequestRow, type PendingRequest } from "./SubscriptionRequestRow";

export default async function AdminSubscriptionRequestsPage() {
  const requests = (await getPendingSubscriptionRequests()) as unknown as PendingRequest[];

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">طلبات الاشتراك</h1>

      {requests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Receipt className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد طلبات بانتظار المراجعة.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((request) => (
            <SubscriptionRequestRow key={request.id} request={request} />
          ))}
        </div>
      )}
    </main>
  );
}
