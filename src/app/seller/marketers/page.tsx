import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { getMyStore, getStoreMarketerStats } from "@/lib/queries/seller";

export default async function SellerMarketersPage() {
  const store = await getMyStore();
  if (!store) redirect("/seller");

  const marketers = await getStoreMarketerStats(store.id);

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">مسوّقو متجري</h1>

      {marketers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Megaphone className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا يوجد مسوّقون يعملون مع متجرك بعد.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {marketers.map((m) => (
            <div key={m.id} className="bg-white rounded-2xl border border-black/5 p-4">
              <p className="text-sm font-bold text-navy mb-2">{m.name}</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="font-extrabold text-navy text-sm">{m.orders}</p>
                  <p className="text-[10px] text-neutral-400">الطلبات</p>
                </div>
                <div>
                  <p className="font-extrabold text-primary text-sm">{m.completed}</p>
                  <p className="text-[10px] text-neutral-400">مكتملة</p>
                </div>
                <div>
                  <p className="font-extrabold text-red-500 text-sm">{m.cancelled}</p>
                  <p className="text-[10px] text-neutral-400">ملغاة</p>
                </div>
                <div>
                  <p className="font-extrabold text-navy text-sm">{m.totalSales.toLocaleString("ar")}</p>
                  <p className="text-[10px] text-neutral-400">إجمالي المبيعات</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-neutral-400">
                  إجمالي عمولاته: <span className="font-bold text-navy">{m.commission.toLocaleString("ar")} SDG</span>
                </p>
                <p className="text-[10px] text-neutral-400">
                  عبر رابط: {m.viaLink} — طلب مباشر: {m.viaAssisted}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
