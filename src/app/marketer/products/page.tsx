import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PromoteProductCard } from "./PromoteProductCard";

export default async function MarketerProductsPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, currency, images, stores(name, marketer_commission_rate)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full p-4">
      <h1 className="font-bold text-xl text-navy mb-1">منتجات متاحة للتسويق</h1>
      <p className="text-xs text-neutral-400 mb-4">اختر منتجًا، شارك رابطك، واربح عمولة عند إتمام الطلب.</p>

      {!products || products.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Package className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد منتجات متاحة حاليًا.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {products.map((product) => (
            <PromoteProductCard
              key={product.id}
              product={{
                id: product.id,
                name: product.name,
                price: product.price,
                currency: product.currency,
                images: product.images,
                storeName: (product.stores as { name: string } | null)?.name ?? "",
                commissionRate: (product.stores as { marketer_commission_rate: number } | null)?.marketer_commission_rate ?? 0,
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}
