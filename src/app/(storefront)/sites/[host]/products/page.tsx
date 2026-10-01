import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { ArrowLeft } from 'lucide-react';
import { ProductBrowser } from '@/components/storefront/ProductBrowser';
import { listStorefrontProducts } from '@/lib/products/storefront';
import { storeChrome } from '@/lib/tenant/chrome';

export const revalidate = 60;

/**
 * ★★ هذا ما يفتح التخزين التدريجي (ISR) لمسارٍ ذي معامل ديناميكي —
 * ومعه **عدمُ قراءة `searchParams` هنا**.
 *
 * قياس المرحلة السابقة: ٨٨٪ من كلفة أيّ صفحة متجر ديناميكية هو
 * تصيير التخطيط (٢٤–٢٧ م.ث) لا جسم الصفحة (٣–٨ م.ث). وقراءة
 * `searchParams` كانت تُخرج المسار كلّه من التخزين فتُصيَّره لكل طلب.
 *
 * فالصفحة الآن تُصيّر النسخة **الافتراضية** (صفحة ١، الأحدث) وتُخزَّن
 * وتُفهرس، والترقيم والترتيب يقرأهما `ProductBrowser` على العميل
 * ويجلبهما من `/api/products` — مسارٌ بلا تخطيط وجوابه قابل للتخزين.
 */
export async function generateStaticParams() {
  return [];
}

const PAGE_SIZE = 24;

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
  { params }: PageProps<'/sites/[host]/products'>,
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  // ★ كانت التصنيفات تُجلب ثم تُنتظر ثم تُجلب المنتجات — موجتان
  // متسلسلتان لا تعتمد إحداهما على الأخرى. والتصنيفات نفسها كان
  // التخطيط قد جلبها لتوّه. الآن: القشرة المخزَّنة + المنتجات معًا.
  const [chrome, { products, total }] = await Promise.all([
    storeChrome(store.storeId),
    listStorefrontProducts({
      storeId: store.storeId, sort: 'newest', from: 0, size: PAGE_SIZE,
    }),
  ]);
  const categories = chrome.categories;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      {/* ═══ ترويسة الصفحة ═══ */}
      <div>
        <h1 className="text-[24px] font-bold leading-tight text-ink-900 sm:text-[28px]">
          كل المنتجات
        </h1>
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

      {/* ═══ الترتيب والشبكة والترقيم ═══
          ★ الثلاثة داخل `ProductBrowser`: الافتراضي منها مُصيَّر
          خادميًّا (بديل الـSuspense هو المحتوى الحقيقي) فيقرؤه الزاحف،
          وغير الافتراضي يُجلب من `/api/products` بلا تصيير تخطيط. */}
      <ProductBrowser kind="all" host={host} sortBarInFallback
                      initial={{ products, total, page: 1,
                                 pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }}
                      emptyTitle="لا توجد منتجات متاحة حاليًا"
                      emptyDescription="تابع المتجر — ستُعرض المنتجات هنا فور إضافتها." />
    </div>
  );
}
