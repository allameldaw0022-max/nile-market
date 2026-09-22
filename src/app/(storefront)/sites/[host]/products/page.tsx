import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';
import { ProductGrid } from '@/components/storefront/ProductGrid';
import { Button } from '@/components/ui/Button';
import { listStorefrontProducts, type Sort } from '@/lib/products/storefront';

export const revalidate = 60;

const PAGE_SIZE = 24;
const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'price_asc', label: 'الأرخص' },
  { value: 'price_desc', label: 'الأغلى' },
  { value: 'name', label: 'الاسم' },
];

export async function generateMetadata(
  { params }: PageProps<'/sites/[host]/products'>,
): Promise<Metadata> {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) return { title: 'المتجر غير موجود' };
  return {
    title: `المنتجات — ${store.name}`,
    alternates: { canonical: `https://${store.primaryHost}/products` },
  };
}

export default async function AllProductsPage(
  { params, searchParams }: PageProps<'/sites/[host]/products'>,
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const sortParam = typeof sp.sort === 'string' ? sp.sort : 'newest';
  const sort = (SORTS.some((s) => s.value === sortParam) ? sortParam : 'newest') as Sort;

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from('categories').select('id, name, slug')
    .eq('store_id', store.storeId).eq('is_active', true).is('deleted_at', null)
    .order('sort_order').limit(24);

  const { products, total } = await listStorefrontProducts({
    storeId: store.storeId, sort,
    from: (page - 1) * PAGE_SIZE, size: PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy-900">كل المنتجات</h1>
          <p className="text-sm text-sand-600 tabular">{total} منتج</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <Link key={s.value} href={`/products?sort=${s.value}`}
                  aria-current={sort === s.value ? 'page' : undefined}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                    sort === s.value
                      ? 'border-nile-500 bg-nile-500 text-white'
                      : 'border-sand-300 bg-white text-sand-700 hover:border-nile-400'}`}>
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {categories && categories.length > 0 && (
        <nav className="mt-5 flex gap-2 overflow-x-auto no-scrollbar pb-1"
             aria-label="التصنيفات">
          {categories.map((c) => (
            <Link key={c.id} href={`/categories/${c.slug}`}
                  className="shrink-0 rounded-full border border-sand-300 bg-white px-4 py-2
                             text-sm font-bold text-navy-700 hover:border-nile-500">
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-6">
        <ProductGrid products={products} emptyTitle="لا توجد منتجات بعد"
                     emptyDescription="سيضيف المتجر منتجاته قريبًا." />
      </div>

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="ترقيم الصفحات">
          {page > 1 && (
            <Link href={`/products?sort=${sort}&page=${page - 1}`}>
              <Button variant="outline" size="sm">السابق</Button>
            </Link>
          )}
          <span className="text-sm text-sand-600 tabular">صفحة {page} من {pages}</span>
          {page < pages && (
            <Link href={`/products?sort=${sort}&page=${page + 1}`}>
              <Button variant="outline" size="sm">التالي</Button>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
