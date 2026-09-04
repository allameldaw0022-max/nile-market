import { Store, Clock, ShoppingBag, Users } from "lucide-react";
import { getAdminStats } from "@/lib/queries/admin";

export default async function AdminDashboardPage() {
  const stats = await getAdminStats();

  const cards = [
    { label: "المتاجر", value: stats.storesCount, icon: Store },
    { label: "بانتظار المراجعة", value: stats.pendingStoresCount, icon: Clock },
    { label: "الطلبات", value: stats.ordersCount, icon: ShoppingBag },
    { label: "العملاء", value: stats.customersCount, icon: Users },
  ];

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">لوحة الإدارة</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-black/5 p-4 text-center">
            <card.icon className="mx-auto text-primary mb-1" size={20} />
            <p className="font-extrabold text-navy text-lg">{card.value}</p>
            <p className="text-[11px] text-neutral-400">{card.label}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
