import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { getMyStore, getStoreProductsAdmin } from "@/lib/queries/seller";
import { redirect } from "next/navigation";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "نشط", className: "bg-primary/10 text-primary" },
  hidden: { label: "مخفي", className: "bg-neutral-100 text-neutral-500" },
  out_of_stock: { label: "نفدت الكمية", className: "bg-red-500/10 text-red-500" },
};

export default async function SellerProductsPage() {
  const store = await getMyStore();
  if (!store) redirect("/seller");

  const products = await getStoreProductsAdmin(store.id);

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-bold text-xl text-navy">منتجاتي</h1>
        <Link
          href="/seller/products/new"
          className="flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3.5 py-2.5 rounded-xl"
        >
          <Plus size={15} /> إضافة منتج
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Package className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد منتجات بعد.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((product) => {
            const meta = STATUS_LABELS[product.status];
            return (
              <Link
                key={product.id}
                href={`/seller/products/${product.id}/edit`}
                className="flex items-center justify-between bg-white rounded-2xl border border-black/5 p-4"
              >
                <div>
                  <p className="text-sm font-bold text-navy">{product.name}</p>
                  <p className="text-xs text-neutral-400">
                    {product.price.toLocaleString("ar")} {product.currency} — مخزون: {product.stock}
                  </p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${meta.className}`}>
                  {meta.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
