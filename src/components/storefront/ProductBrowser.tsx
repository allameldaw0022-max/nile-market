'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ProductShowcaseView } from './ProductShowcase';
import { EmptyState } from '@/components/ui/States';
import { Package } from 'lucide-react';
import type { StorefrontProduct } from './ProductCard';
import { DigitalGrid } from './digital/DigitalGrid';

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

/**
 * ★ نمط العرض: بطاقات المتجر العادي أو بطاقات القالب الرقمي.
 *
 * التبديل هنا لا في نسخةٍ ثانية من المتصفّح: منطق الترقيم والترتيب
 * والبحث و`/api/products` والحفاظ على الرابط — كلّه واحد، وما يختلف
 * هو رسم البطاقة وحده.
 */
export type BrowseSkin = 'classic' | 'digital';

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
export function DefaultGrid({
  products, host, total, emptyTitle, emptyDescription, skin = 'classic',
}: {
  products: StorefrontProduct[]; host: string; total: number;
  emptyTitle: string; emptyDescription?: string; skin?: BrowseSkin;
}) {
  return (
    <BrowseShell total={total} pages={Math.max(1, Math.ceil(total / BROWSE_PAGE_SIZE))}
                 page={1} sort="newest" showSort={false} onGo={null} skin={skin}>
      {products.length === 0
        ? <EmptyState icon={<Package size={36} strokeWidth={1.5} />}
                      title={emptyTitle} description={emptyDescription} />
        : <Cards products={products} host={host} skin={skin} />}
    </BrowseShell>
  );
}

/** رسم البطاقات حسب النمط — نقطة التبديل الوحيدة بين القالبين. */
function Cards({ products, host, skin }: {
  products: StorefrontProduct[]; host: string; skin: BrowseSkin;
}) {
  if (skin === 'digital') return <DigitalGrid products={products} host={host} />;
  return <ProductShowcaseView products={products} host={host} />;
}

function BrowseShell({ total, pages, page, children, onGo, skin = 'classic' }: {
  total: number; pages: number; page: number; sort: string; showSort: boolean;
  onGo: ((next: Record<string, string>) => void) | null;
  children: React.ReactNode; skin?: BrowseSkin;
}) {
  return (
    <>
      <p className={`text-[13px] tabular ${skin === 'digital' ? '' : 'text-ink-500'}`}
         style={skin === 'digital' ? { color: 'var(--d-text-2)' } : undefined}
         data-total>{total} منتج</p>
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

function Browser({ kind, host, initial, categorySlug, emptyTitle, emptyDescription,
                  skin = 'classic' }: {
  kind: BrowseKind; host: string; initial: Payload;
  categorySlug?: string; emptyTitle: string; emptyDescription?: string;
  skin?: BrowseSkin;
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
        <div className={`mt-7 flex flex-wrap items-center gap-x-1 gap-y-2 pb-3
                         ${skin === 'digital' ? 'border-b' : 'border-b border-ink-200'}`}
             style={skin === 'digital' ? { borderColor: 'var(--d-border)' } : undefined}>
          <span className="me-2 text-[12px] font-semibold"
                style={skin === 'digital'
                  ? { color: 'var(--d-text-2)' } : { color: 'var(--color-ink-500)' }}>
            ترتيب حسب
          </span>
          {SORTS.map((s) => {
            const on = sort === s.value;
            if (skin === 'digital') {
              return (
                <button key={s.value} type="button"
                        onClick={() => go({ sort: s.value, page: '' })}
                        aria-current={on ? 'page' : undefined}
                        className="rounded-md px-2.5 py-1.5 text-[13px] transition-colors"
                        style={on
                          ? { color: 'var(--d-accent)', fontWeight: 700,
                              textDecoration: 'underline',
                              textUnderlineOffset: '6px' }
                          : { color: 'var(--d-text-2)', fontWeight: 500 }}>
                  {s.label}
                </button>
              );
            }
            return (
              <button key={s.value} type="button"
                      onClick={() => go({ sort: s.value, page: '' })}
                      aria-current={on ? 'page' : undefined}
                      className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                        on
                          ? 'font-bold text-teal-700 underline underline-offset-[6px]'
                          : 'font-medium text-ink-600 hover:text-ink-900'}`}>
                {s.label}
              </button>
            );
          })}
        </div>
      )}
      <div>
        {empty ? (
          <p className={`mt-6 rounded-lg border border-dashed px-6 py-12 text-center
                         text-sm ${skin === 'digital'
                           ? '' : 'border-ink-300 bg-white text-ink-500'}`}
             style={skin === 'digital'
               ? { borderColor: 'var(--d-border-strong)',
                   background: 'var(--d-surface)', color: 'var(--d-text-2)' }
               : undefined}>
            اكتب حرفين على الأقل للبحث.
          </p>
        ) : (
          <BrowseShell total={data.total} pages={data.pages} page={data.page}
                       sort={sort} showSort={false} onGo={go} skin={skin}>
            {data.products.length === 0
              ? <EmptyState icon={<Package size={36} strokeWidth={1.5} />}
                            title={emptyTitle} description={emptyDescription} />
              : <Cards products={data.products} host={host} skin={skin} />}
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
  skin?: BrowseSkin;
}) {
  return (
    <Suspense fallback={
      <>
        {props.sortBarInFallback && <SortBarStatic skin={props.skin ?? 'classic'} />}
        <DefaultGrid products={props.initial.products} host={props.host}
                     total={props.initial.total}
                     emptyTitle={props.emptyTitle}
                     emptyDescription={props.emptyDescription}
                     skin={props.skin ?? 'classic'} />
      </>
    }>
      <Browser {...props} />
    </Suspense>
  );
}

/** شريط الترتيب في الـHTML المُصيَّر مسبقًا — روابط حقيقية للزاحف. */
function SortBarStatic({ skin = 'classic' }: { skin?: BrowseSkin }) {
  const d = skin === 'digital';
  return (
    <div className={`mt-7 flex flex-wrap items-center gap-x-1 gap-y-2 pb-3
                     ${d ? 'border-b' : 'border-b border-ink-200'}`}
         style={d ? { borderColor: 'var(--d-border)' } : undefined}>
      <span className="me-2 text-[12px] font-semibold"
            style={d ? { color: 'var(--d-text-2)' } : { color: 'var(--color-ink-500)' }}>
        ترتيب حسب
      </span>
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
