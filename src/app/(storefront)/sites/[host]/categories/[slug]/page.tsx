import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { decodeSlugParam } from '@/lib/tenant/params';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { storeTag } from '@/lib/tenant/resolve';
import { ProductBrowser } from '@/components/storefront/ProductBrowser';
import { listStorefrontProducts } from '@/lib/products/storefront';

export const revalidate = 60;
const PAGE_SIZE = 24;

/**
 * ★ نفس سبب `/products`: لا تُقرأ `searchParams` هنا، فتُخزَّن النسخة
 * الأساسية للتصنيف (صفحة ١) وتُفهرس، ويأتي الترقيم من `/api/products`
 * بلا تصيير تخطيط (٨٨٪ من كلفة الطلب المقيسة).
 */
export async function generateStaticParams() {
  return [];
}

/**
 * ★ عميل بلا كوكيز + تخزين: التصنيف بيانٌ عامّ واحد لكل الزوّار،
 * وكان جلبه بعميل الجلسة يمنع تخزين الصفحة كلّها.
 */
const categoryOf = (storeId: string, slug: string) => unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from('categories').select('id, name, slug')
      .eq('store_id', storeId).eq('slug', slug)
      .eq('is_active', true).is('deleted_at', null)
      .maybeSingle();
    return data;
  },
  ['sf-category', storeId, slug],
  { revalidate: 300, tags: [storeTag(storeId, 'settings')] },
);

async function loadCategory(host: string, slug: string) {
  const store = await resolveStoreByHost(host);
  if (!store) return null;
  const data = await categoryOf(store.storeId, slug)();
  return data ? { store, category: data } : null;
}

export async function generateMetadata(
  { params }: PageProps<'/sites/[host]/categories/[slug]'>,
): Promise<Metadata> {
  const { host, slug: rawSlug } = await params;
  const slug = decodeSlugParam(rawSlug);
  const found = await loadCategory(host, slug);
  if (!found) return { title: 'التصنيف غير موجود' };
  return {
    title: `${found.category.name} — ${found.store.name}`,
    alternates: {
      canonical: `https://${found.store.primaryHost}/categories/${found.category.slug}`,
    },
  };
}

export default async function CategoryPage(
  { params }: PageProps<'/sites/[host]/categories/[slug]'>,
) {
  const { host, slug: rawSlug } = await params;
  const slug = decodeSlugParam(rawSlug);
  const found = await loadCategory(host, slug);
  if (!found) notFound();

  const { products, total } = await listStorefrontProducts({
    storeId: found.store.storeId, categoryId: found.category.id,
    from: 0, size: PAGE_SIZE,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <nav className="flex items-center gap-1 text-sm text-ink-500" aria-label="المسار">
        <Link href="/" className="hover:text-teal-700">الرئيسية</Link>
        <ChevronRight size={14} />
        <Link href="/products" className="hover:text-teal-700">المنتجات</Link>
      </nav>

      <h1 className="mt-4 text-xl font-extrabold text-ink-900">{found.category.name}</h1>
      {/* ★ العدد والشبكة والترقيم داخل المتصفّح: الافتراضي مُصيَّر
          خادميًّا (بديل الـSuspense) وغيره من `/api/products`. */}
      <ProductBrowser kind="category" host={host} categorySlug={found.category.slug}
                      initial={{ products, total, page: 1,
                                 pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }}
                      emptyTitle="لا منتجات في هذا التصنيف"
                      emptyDescription="تصفّح بقية المنتجات." />
    </div>
  );
}
