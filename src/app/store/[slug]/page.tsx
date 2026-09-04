import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { ProductCard } from "@/components/product/ProductCard";
import { getStoreBySlug, getStoreProducts } from "@/lib/queries/catalog";

export default async function StorePage({ params }: PageProps<"/store/[slug]">) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store || store.status !== "active") notFound();

  const products = await getStoreProducts(store.id);

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full p-4">
      <div className="bg-white rounded-2xl border border-black/5 p-5 mb-5">
        <h1 className="font-extrabold text-xl text-navy">{store.name}</h1>
        {store.description && <p className="text-sm text-neutral-500 mt-1">{store.description}</p>}
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-black/10">
          <Package className="mx-auto text-neutral-300 mb-2" size={32} />
          <p className="text-sm text-neutral-400">لا توجد منتجات في هذا المتجر بعد.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </main>
  );
}
