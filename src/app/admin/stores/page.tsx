import { Store } from "lucide-react";
import { getAllStores } from "@/lib/queries/admin";
import { StoreStatusControl } from "./StoreStatusControl";

export default async function AdminStoresPage() {
  const stores = await getAllStores();

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">المتاجر</h1>

      {stores.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Store className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد متاجر بعد.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {stores.map((store) => (
            <StoreStatusControl key={store.id} store={store} />
          ))}
        </div>
      )}
    </main>
  );
}
