import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getMyStoreContext, getStoreOrderItems } from "@/lib/queries/seller";
import { OrderItemRow, type SellerOrderItem } from "./OrderItemRow";

export default async function SellerOrdersPage() {
  const context = await getMyStoreContext();
  if (!context) redirect("/seller");

  const items = (await getStoreOrderItems(context.store.id)) as unknown as SellerOrderItem[];

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">طلبات متجري</h1>

      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <ClipboardList className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد طلبات بعد.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <OrderItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
