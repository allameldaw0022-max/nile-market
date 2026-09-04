import { ShoppingBag, Package, Wallet, Clock } from "lucide-react";
import { getMyStoreContext, getStoreStats } from "@/lib/queries/seller";
import { CreateStoreForm } from "./CreateStoreForm";

const STORE_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "بانتظار المراجعة", className: "bg-amber-500/10 text-amber-600" },
  active: { label: "نشط", className: "bg-primary/10 text-primary" },
  suspended: { label: "موقوف", className: "bg-red-500/10 text-red-500" },
};

export default async function SellerDashboardPage() {
  const context = await getMyStoreContext();
  if (!context) return <CreateStoreForm />;
  const { store, isOwner } = context;

  const stats = await getStoreStats(store.id);
  const statusMeta = STORE_STATUS_LABELS[store.status];

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-bold text-xl text-navy">{store.name}</h1>
        <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full ${statusMeta.className}`}>
          {statusMeta.label}
        </span>
      </div>
      {!isOwner && (
        <p className="text-xs text-neutral-400 -mt-3 mb-4">أنت تدخل كموظف في هذا المتجر</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-black/5 p-4 text-center">
          <Package className="mx-auto text-primary mb-1" size={20} />
          <p className="font-extrabold text-navy">{stats.productsCount}</p>
          <p className="text-[11px] text-neutral-400">المنتجات</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 p-4 text-center">
          <ShoppingBag className="mx-auto text-primary mb-1" size={20} />
          <p className="font-extrabold text-navy">{stats.ordersCount}</p>
          <p className="text-[11px] text-neutral-400">الطلبات</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 p-4 text-center">
          <Wallet className="mx-auto text-primary mb-1" size={20} />
          <p className="font-extrabold text-navy">{stats.revenue.toLocaleString("ar")}</p>
          <p className="text-[11px] text-neutral-400">المبيعات (SDG)</p>
        </div>
      </div>

      {store.status === "pending" && (
        <div className="flex items-start gap-2 bg-amber-500/10 text-amber-700 rounded-2xl p-4 mt-4 text-xs">
          <Clock size={16} className="shrink-0 mt-0.5" />
          متجرك قيد المراجعة من الإدارة، ولن يظهر للعملاء حتى تتم الموافقة عليه. يمكنك إضافة منتجاتك الآن استعدادًا.
        </div>
      )}
    </main>
  );
}
