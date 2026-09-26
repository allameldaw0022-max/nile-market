import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { ProductBrowser } from '@/components/storefront/ProductBrowser';

export const metadata: Metadata = {
  title: 'البحث',
  // صفحات البحث لا تُفهرس: محتواها مكرر عن صفحات التصنيف (§22)
  robots: { index: false, follow: true },
};

/**
 * ★★ البحث هو أفضل حالة لهذا النمط: الصفحة `noindex` أصلًا، فلا كلفة
 * SEO إطلاقًا في نقل النتائج إلى العميل. والقشرة (النموذج والحالة
 * الفارغة) تُخزَّن، وكل بحث يذهب إلى `/api/products` — معالجٌ بلا
 * تخطيط (٥ م.ث) بدل تصيير الصفحة كاملة (٣٠ م.ث).
 */
export async function generateStaticParams() {
  return [];
}

export default async function SearchPage(
  { params }: PageProps<'/sites/[host]/search'>,
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-extrabold text-ink-900">البحث في {store.name}</h1>

      <form action="/search" className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input name="q" maxLength={80}
                 placeholder="اكتب اسم المنتج" aria-label="كلمة البحث"
                 className="h-12 w-full rounded-md border border-ink-400 bg-white
                            ps-10 pe-3 text-[15px] text-ink-900 placeholder:text-ink-500
                            focus:border-teal-600" />
        </div>
        <button type="submit"
                className="h-12 rounded-md bg-teal-600 px-5 font-bold text-white
                           hover:bg-teal-700">
          بحث
        </button>
      </form>

      <ProductBrowser kind="search" host={host}
                      initial={{ products: [], total: 0, page: 1, pages: 1 }}
                      emptyTitle="لا نتائج"
                      emptyDescription="جرّب كلمة أخرى أو تصفّح كل المنتجات." />
    </div>
  );
}
