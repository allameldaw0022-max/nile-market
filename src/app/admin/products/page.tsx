import { Package } from "lucide-react";
import { getAllProducts } from "@/lib/queries/admin";
import { AdminProductRow, type AdminProduct } from "./AdminProductRow";

export default async function AdminProductsPage() {
  const products = (await getAllProducts()) as unknown as AdminProduct[];

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-4">كل المنتجات ({products.length})</h1>

      {products.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Package className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد منتجات بعد.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((product) => (
            <AdminProductRow key={product.id} product={product} />
          ))}
        </div>
      )}
    </main>
  );
}
