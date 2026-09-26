'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ProductShowcaseView } from './ProductShowcase';
import { EmptyState } from '@/components/ui/States';
import { Package } from 'lucide-react';
import type { StorefrontProduct } from './ProductCard';

/**
 * ★★ تصفّح المنتجات — الافتراضي خادميّ مخزَّن، والتفاعل خفيف.
 *
 * ما كان يمنع تخزين `/products` و`/categories/[slug]` و`/search` هو
 * قراءة `searchParams` في الصفحة: قراءتُها تُخرج المسار كلّه من
 * التخزين، فيُصيَّر التخطيط (٨٨٪ من الكلفة المقيسة) في كل طلب.
 *
 * فالصفحة صارت لا تقرأ `searchParams` إطلاقًا: تُصيَّر النسخة
 * الافتراضية (صفحة ١، الأحدث) خادميًّا وتُخزَّن، وهذا المكوّن يقرأ
 * المعاملات على العميل ويجلب غير الافتراضي من `/api/products` —
 * مسارٌ بلا تخطيط (٥ م.ث مقابل ٣٠) وجوابه قابل للتخزين علنًا.
 *
 * ★★ وSEO محفوظ بحيلة واحدة مقصودة: `useSearchParams` في صفحة
 *   مخزَّنة يُلزم Next بأن يضع **البديل (fallback)** في الـHTML
 *   المُصيَّر مسبقًا لا المكوّن نفسه (موثَّق في دليل Next). فلو كان
 *   البديل «جارٍ التحميل…» لخلا HTML صفحة المنتجات من أيّ منتج —
 *   وهذا بالضبط ما يجب ألّا يحدث. لذلك **البديل هو الشبكة الافتراضية
 *   المصيَّرة خادميًّا نفسها**: يقرأ الزاحف منتجات حقيقية، ثم يتولّى
 *   العميل بعد الإماهة بنفس المخرَج تمامًا.
 *
 * ★ ولا بيان شخصي هنا: حالة المفضّلة والدخول تأتي من
 *   `ViewerProvider` كما في بقيّة الشجرة، لا من هذا الجلب.
 */
export type BrowseKind = 'all' | 'category' | 'search';

type Payload = {
  products: StorefrontProduct[]; total: number; page: number; pages: number;
};

export const BROWSE_PAGE_SIZE = 24;

export const SORTS: { value: string; label: string }[] = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'price_asc', label: 'الأرخص' },
  { value: 'price_desc', label: 'الأغلى' },
  { value: 'name', label: 'الاسم' },
];

/** الشبكة الافتراضية — تُستعمل بديلًا للـSuspense فتدخل الـHTML. */
export function DefaultGrid({ products, host, total, emptyTitle, emptyDescription }: {
  products: StorefrontProduct[]; host: string; total: number;
  emptyTitle: string; emptyDescription?: string;
}) {
  return (
    <BrowseShell total={total} pages={Math.max(1, Math.ceil(total / BROWSE_PAGE_SIZE))}
                 page={1} sort="newest" showSort={false} onGo={null}>
      {products.length === 0
        ? <EmptyState icon={<Package size={36} strokeWidth={1.5} />}
                      title={emptyTitle} description={emptyDescription} />
        : <ProductShowcaseView products={products} host={host} />}
    </BrowseShell>
  );
}

function BrowseShell({ total, pages, page, children, onGo }: {
  total: number; pages: number; page: number; sort: string; showSort: boolean;
  onGo: ((next: Record<string, string>) => void) | null;
  children: React.ReactNode;
}) {
  return (
    <>
      <p className="text-[13px] text-ink-500 tabular" data-total>{total} منتج</p>
      <div className="mt-6">{children}</div>
      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2"
             aria-label="ترقيم الصفحات">
          {page > 1 && (
            <Button variant="outline" size="sm"
                    onClick={() => onGo?.({ page: String(page - 1) })}>السابق</Button>
          )}
          <span className="text-sm text-ink-500 tabular">صفحة {page} من {pages}</span>
          {page < pages && (
            <Button variant="outline" size="sm"
                    onClick={() => onGo?.({ page: String(page + 1) })}>التالي</Button>
          )}
        </nav>
      )}
    </>
  );
}

function Browser({ kind, host, initial, categorySlug, emptyTitle, emptyDescription }: {
  kind: BrowseKind; host: string; initial: Payload;
  categorySlug?: string; emptyTitle: string; emptyDescription?: string;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<Payload>(initial);

  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const sortRaw = params.get('sort') ?? 'newest';
  const sort = SORTS.some((s) => s.value === sortRaw) ? sortRaw : 'newest';
  const q = (params.get('q') ?? '').trim();

  // هل الطلب هو الافتراضي الذي صيَّره الخادم أصلًا؟
  const isDefault = page === 1 && sort === 'newest'
    && (kind === 'search' ? q.length < 2 : q === '');

  const key = `${kind}|${categorySlug ?? ''}|${page}|${sort}|${q}`;
  const [seenKey, setSeenKey] = useState(key);

  // ★ الضبط أثناء الرسم لا داخل `useEffect`: الرجوع إلى العرض
  //   الافتراضي يستعيد بيان الخادم فورًا بلا دورة رسم ثانية — وهو
  //   النمط الذي توصي به React لمزامنة الحالة مع خاصيّة متغيّرة،
  //   وهو ما يرفضه `react-hooks/set-state-in-effect` بحقّ داخل الأثر.
  if (seenKey !== key) {
    setSeenKey(key);
    if (isDefault) setData(initial);
  }

  useEffect(() => {
    if (isDefault) return;

    const ctl = new AbortController();
    const url = new URL('/api/products', window.location.origin);
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', sort);
    if (categorySlug) url.searchParams.set('category', categorySlug);
    if (q.length >= 2) url.searchParams.set('q', q);

    fetch(url, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: Payload | null) => { if (body) setData(body); })
      .catch(() => {/* تبقى النتائج السابقة معروضة حتى تصل الجديدة */});
    return () => ctl.abort();
  }, [key, isDefault, page, sort, q, categorySlug]);

  // ★ الرابط يبقى قابلًا للمشاركة: المعاملات تُكتب في العنوان، فصفحةٌ
  //   مشتركة تُفتح على نفس النتائج (يقرؤها هذا المكوّن عند التحميل).
  const go = useCallback((next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v); else sp.delete(k);
    }
    if (!next.page) sp.delete('page');
    router.replace(`?${sp.toString()}`, { scroll: false });
  }, [params, router]);

  const showSort = kind !== 'search';
  const empty = kind === 'search' && q.length < 2;

  return (
    <>
      {showSort && (
        <div className="mt-7 flex flex-wrap items-center gap-x-1 gap-y-2
                        border-b border-ink-200 pb-3">
          <span className="me-2 text-[12px] font-semibold text-ink-500">ترتيب حسب</span>
          {SORTS.map((s) => (
            <button key={s.value} type="button"
                    onClick={() => go({ sort: s.value, page: '' })}
                    aria-current={sort === s.value ? 'page' : undefined}
                    className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                      sort === s.value
                        ? 'font-bold text-teal-700 underline underline-offset-[6px]'
                        : 'font-medium text-ink-600 hover:text-ink-900'}`}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div>
        {empty ? (
          <p className="mt-6 rounded-lg border border-dashed border-ink-300 bg-white
                        px-6 py-12 text-center text-sm text-ink-500">
            اكتب حرفين على الأقل للبحث.
          </p>
        ) : (
          <BrowseShell total={data.total} pages={data.pages} page={data.page}
                       sort={sort} showSort={false} onGo={go}>
            {data.products.length === 0
              ? <EmptyState icon={<Package size={36} strokeWidth={1.5} />}
                            title={emptyTitle} description={emptyDescription} />
              : <ProductShowcaseView products={data.products} host={host} />}
          </BrowseShell>
        )}
      </div>
    </>
  );
}

/**
 * ★ حدّ Suspense مطلوب: دليل Next صريح أنّ صفحة ثابتة تنادي
 * `useSearchParams` من مكوّن عميل **يجب** أن تُحاط به وإلا فشل البناء.
 * والبديل هنا هو المحتوى الحقيقي لا لافتة انتظار — وهذا ما يحفظ SEO.
 */
export function ProductBrowser(props: {
  kind: BrowseKind; host: string; initial: Payload; categorySlug?: string;
  emptyTitle: string; emptyDescription?: string; sortBarInFallback?: boolean;
}) {
  return (
    <Suspense fallback={
      <>
        {props.sortBarInFallback && <SortBarStatic />}
        <DefaultGrid products={props.initial.products} host={props.host}
                     total={props.initial.total}
                     emptyTitle={props.emptyTitle}
                     emptyDescription={props.emptyDescription} />
      </>
    }>
      <Browser {...props} />
    </Suspense>
  );
}

/** شريط الترتيب في الـHTML المُصيَّر مسبقًا — روابط حقيقية للزاحف. */
function SortBarStatic() {
  return (
    <div className="mt-7 flex flex-wrap items-center gap-x-1 gap-y-2
                    border-b border-ink-200 pb-3">
      <span className="me-2 text-[12px] font-semibold text-ink-500">ترتيب حسب</span>
      {SORTS.map((s) => (
        <span key={s.value}
              aria-current={s.value === 'newest' ? 'page' : undefined}
              className={`rounded-md px-2.5 py-1.5 text-[13px] ${
                s.value === 'newest'
                  ? 'font-bold text-teal-700 underline underline-offset-[6px]'
                  : 'font-medium text-ink-600'}`}>
          {s.label}
        </span>
      ))}
    </div>
  );
}
