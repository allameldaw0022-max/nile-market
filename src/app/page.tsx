import { Store as StoreIcon } from "lucide-react";
import { StoreCard } from "@/components/store/StoreCard";
import { getActiveStores } from "@/lib/queries/catalog";
import { SITE_NAME } from "@/lib/site";

export default async function HomePage() {
  const stores = await getActiveStores();

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full p-4">
      <section className="bg-gradient-to-l from-primary to-primary-dark text-white rounded-2xl p-6 mb-6">
        <h1 className="text-2xl font-extrabold">{SITE_NAME}</h1>
        <p className="text-white/80 text-sm mt-1">تسوّق من متاجر موثوقة في السودان</p>
      </section>

      <h2 className="font-bold text-navy mb-3">المتاجر</h2>

      {stores.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <StoreIcon className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد متاجر منشورة بعد.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {stores.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </div>
      )}
    </main>
  );
}
