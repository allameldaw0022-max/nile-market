import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { ProductGrid } from '@/components/storefront/ProductGrid';
import { listStorefrontProducts } from '@/lib/products/storefront';
import { searchTerm } from '@/lib/search';

export const metadata: Metadata = {
  title: 'البحث',
  // صفحات البحث لا تُفهرس: محتواها مكرر عن صفحات التصنيف (§22)
  robots: { index: false, follow: true },
};

export default async function SearchPage(
  { params, searchParams }: PageProps<'/sites/[host]/search'>,
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  const sp = await searchParams;
  const term = searchTerm(sp.q);

  const { products, total } = term.length >= 2
    ? await listStorefrontProducts({
        storeId: store.storeId, term, from: 0, size: 48,
      })
    : { products: [], total: 0 };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-extrabold text-ink-900">البحث في {store.name}</h1>

      <form action="/search" className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input name="q" defaultValue={term} maxLength={80}
                 placeholder="اكتب اسم المنتج" aria-label="كلمة البحث"
                 className="h-12 w-full rounded-md border border-ink-400 bg-white
                            ps-10 pe-3 text-[15px] text-ink-900 placeholder:text-ink-400
                            focus:border-teal-600" />
        </div>
        <button type="submit"
                className="h-12 rounded-md bg-teal-600 px-5 font-bold text-white
                           hover:bg-teal-700">
          بحث
        </button>
      </form>

      {term.length >= 2 && (
        <p className="mt-4 text-sm text-ink-500 tabular">{total} نتيجة لـ «{term}»</p>
      )}

      <div className="mt-6">
        {term.length < 2 ? (
          <p className="rounded-lg border border-dashed border-ink-300 bg-white
                        px-6 py-12 text-center text-sm text-ink-500">
            اكتب حرفين على الأقل للبحث.
          </p>
        ) : (
          <ProductGrid products={products} host={host} emptyTitle="لا نتائج"
                       emptyDescription="جرّب كلمة أخرى أو تصفّح كل المنتجات." />
        )}
      </div>
    </div>
  );
}
