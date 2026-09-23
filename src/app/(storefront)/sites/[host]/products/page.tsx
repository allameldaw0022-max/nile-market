import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';
import { ProductShowcase } from '@/components/storefront/ProductShowcase';
import { ArrowLeft } from 'lucide-react';
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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      {/* ═══ ترويسة الصفحة ═══ */}
      <div>
        <h1 className="text-[24px] font-bold leading-tight text-ink-900 sm:text-[28px]">
          كل المنتجات
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-500 tabular">
          {total} منتج
        </p>
      </div>

      {/* ═══ التصنيفات: تنقّل ═══
          ★ كانت أقراصًا مستديرة مطابقة لأقراص الترتيب تمامًا، فبدا
          «الأحدث» و«ملابس» من صنف واحد. التصنيف يقودك إلى مكان آخر،
          والترتيب يعيد ترتيب ما أنت فيه — فلا يصحّ أن يتشابها.
          التصنيفات تأخذ شكل البطاقات نفسه المستعمل في الرئيسية. */}
      {categories && categories.length > 0 && (
        <nav aria-label="التصنيفات" className="mt-7">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            التصنيفات
          </p>
          <ul className="mt-2.5 grid grid-cols-2 gap-2.5 [&>*]:min-w-0
                         sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/categories/${c.slug}`}
                      className="group flex h-14 items-center justify-between gap-2
                                 rounded-lg border border-ink-200 bg-white px-4 py-3
                                 transition-colors hover:border-teal-600">
                  <span className="truncate text-[14px] font-semibold text-ink-900">
                    {c.name}
                  </span>
                  <ArrowLeft size={15} aria-hidden
                             className="flip-rtl shrink-0 text-ink-300
                                        transition-colors group-hover:text-teal-700" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* ═══ الترتيب: تحكّم لا تنقّل ═══
          شريط خفيف بعنوان صريح وخيارات نصّية متجاورة — لا أقراص
          ملوّنة تنافس التصنيفات على الانتباه. */}
      <div className="mt-7 flex flex-wrap items-center gap-x-1 gap-y-2
                      border-b border-ink-200 pb-3">
        <span className="me-2 text-[12px] font-semibold text-ink-500">ترتيب حسب</span>
        {SORTS.map((s) => (
          <Link key={s.value} href={`/products?sort=${s.value}`}
                aria-current={sort === s.value ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                  sort === s.value
                    ? 'font-bold text-teal-700 underline underline-offset-[6px]'
                    : 'font-medium text-ink-600 hover:text-ink-900'}`}>
            {s.label}
          </Link>
        ))}
      </div>

      <div className="mt-7">
        <ProductShowcase products={products} host={host}
                         emptyTitle="لا توجد منتجات متاحة حاليًا"
                         emptyDescription="تابع المتجر — ستُعرض المنتجات هنا فور إضافتها." />
      </div>

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="ترقيم الصفحات">
          {page > 1 && (
            <Link href={`/products?sort=${sort}&page=${page - 1}`}>
              <Button variant="outline" size="sm">السابق</Button>
            </Link>
          )}
          <span className="text-sm text-ink-500 tabular">صفحة {page} من {pages}</span>
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
