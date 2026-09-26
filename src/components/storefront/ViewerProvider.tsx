'use client';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { CART_EVENT } from './cartEvent';
import { VIEWER_HINT_COOKIE } from '@/lib/referral';

/**
 * ★★ هل يملك هذا المتصفّح شيئًا شخصيًّا أصلًا؟
 *
 * الـproxy يكتب `nm_v` ببتّين: «توكن سلّة؟» و«جلسة؟». فإن كانا صفرين
 * فجواب `/viewer` معروفٌ سلفًا (زائر بلا سلّة ولا حساب) ولا داعي
 * لرحلة خادم. وهذا يحذف **نداءً لكل عرض صفحة** لأغلب زوّار المتاجر —
 * وهو ما يصير الكلفة الأصلية الأولى حين تُخدَم الصفحات من الـCDN.
 *
 * ★ يفشل نحو **النداء** لا نحو التخطّي: كوكي غائب أو محجوب أو بقيمة
 *   غير متوقّعة ⇒ نُنادي. فالخطأ يكلّف طلبًا، لا شارةَ سلّة مفقودة.
 */
function hasNothingPersonal(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const m = new RegExp(`(?:^|; )${VIEWER_HINT_COOKIE}=([^;]*)`).exec(document.cookie);
    return m?.[1] === '00';
  } catch {
    return false;
  }
}

/**
 * ★★ حالة الزائر على العميل — الثمن الذي دُفع لتخزين صفحة المتجر.
 *
 * كانت هذه الحالة تُجلب خادميًا داخل شجرة التصيير (عدّاد السلة في
 * التخطيط، والمفضّلة وحالة الدخول في كل بطاقة منتج)، فكان وجودها
 * وحده يمنع تخزين الصفحة ويفرض تصييرًا كاملًا لكل زائر.
 *
 * الآن تُجلب مرّة واحدة بعد الإماهة من `/viewer`، ويتشارَكها كل
 * المستهلكين في الصفحة: شارة السلة، وأزرار المفضّلة، وأيقونات
 * الحساب، ونموذج التقييم.
 *
 * ★ الحالة الابتدائية هي **حالة الزائر غير المسجَّل** — وهي نفسها ما
 *   يراه الزائر الجديد، أي أنّ الـHTML المخزَّن صحيح له تمامًا.
 *   والمسجَّل يرى قلوبه وسلّته بعد جلبة واحدة قصيرة.
 *
 * ★ ولا يُخزَّن أيّ شيء من هذا في الـHTML: لو خُزِّن لظهرت سلّة زائر
 *   لزائر آخر — وهو بالضبط الخطأ الذي يجعل التخزين خطرًا.
 */
export type ReviewState = {
  canReview: boolean; reason: string;
  myRating: number | null; myBody: string | null; myHidden: boolean;
};

export type ViewerState = {
  ready: boolean;
  signedIn: boolean;
  cartCount: number;
  saved: Set<string>;
  needsMerge: boolean;
  owner: boolean;
  review: ReviewState | null;
  /** تحديث محلّي فوري بعد فعل ناجح — لا إعادة جلب */
  setCartCount: (n: number) => void;
  setSaved: (productId: string, on: boolean) => void;
  refresh: () => void;
};

const NOBODY: ViewerState = {
  ready: false, signedIn: false, cartCount: 0, saved: new Set(),
  needsMerge: false, owner: false, review: null,
  setCartCount: () => {}, setSaved: () => {}, refresh: () => {},
};

const Ctx = createContext<ViewerState>(NOBODY);

export function useViewer(): ViewerState {
  return useContext(Ctx);
}

type Payload = {
  signedIn: boolean; cartCount: number; saved: string[];
  needsMerge: boolean; owner: boolean; review: ReviewState | null;
};

export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // ★ سَلَك المنتج يُشتقّ من المسار لا يُمرَّر خاصيّةً: المزوّد يعلو
  //   الصفحة في الشجرة، فتمريرُ المعرّف إليه كان يعني مزوّدًا ثانيًا
  //   داخل صفحة المنتج ⇒ جلبتين لكل عرض. والخادم يترجم السَلَك إلى
  //   معرّف باستعلام مخزَّن.
  const slug = productSlugOf(pathname);
  const [data, setData] = useState<Payload | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // ★ لا نداء لمن لا يملك سلّة ولا جلسة: جوابه معروف، وهو الحالة
    //   الابتدائية المعروضة أصلًا — فلا حاجة حتى لضبط حالة (وضبطها
    //   داخل `useEffect` يرفضه `react-hooks/set-state-in-effect`
    //   بحقّ: دورة رسم ثانية بلا أيّ تغيير في المعروض).
    if (hasNothingPersonal()) return;

    const ctl = new AbortController();
    const url = slug ? `/viewer?slug=${encodeURIComponent(slug)}` : '/viewer';
    // ★ `no-store`: جواب هذا المسار خاصّ بالزائر، ولا يجوز أن يستقرّ
    //   في ذاكرة المتصفّح فيُعاد استعماله بعد خروجه.
    fetch(url, { signal: ctl.signal, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: Payload | null) => { if (body) setData(body); })
      .catch(() => {/* الصفحة العامة معروضة أصلًا */});
    return () => ctl.abort();
  }, [slug, tick]);

  const setCartCount = useCallback((n: number) => {
    setData((prev) => ({ ...(prev ?? blank()), cartCount: Math.max(0, n) }));
  }, []);

  const setSaved = useCallback((id: string, on: boolean) => {
    setData((prev) => {
      const base = prev ?? blank();
      const next = new Set(base.saved);
      if (on) next.add(id); else next.delete(id);
      return { ...base, saved: [...next] };
    });
  }, []);

  // ★ أفعال السلة تعيد العدد الحقيقي من القاعدة وتُطلقه كحدث — نفس
  //   الآليّة القائمة قبل هذا الفصل، فلا يتغيّر شيء في تلك الأفعال.
  useEffect(() => {
    const onCount = (e: Event) => {
      const n = (e as CustomEvent<number>).detail;
      if (typeof n === 'number' && n >= 0) setCartCount(n);
    };
    window.addEventListener(CART_EVENT, onCount);
    return () => window.removeEventListener(CART_EVENT, onCount);
  }, [setCartCount]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const value = useMemo<ViewerState>(() => ({
    ready: data !== null,
    signedIn: data?.signedIn ?? false,
    cartCount: data?.cartCount ?? 0,
    saved: new Set(data?.saved ?? []),
    needsMerge: data?.needsMerge ?? false,
    owner: data?.owner ?? false,
    review: data?.review ?? null,
    setCartCount, setSaved, refresh,
  }), [data, setCartCount, setSaved, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** `/products/<slug>` وحدها؛ وما عداها لا تحتاج حالة تقييم. */
function productSlugOf(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = /^\/products\/([^/]+)\/?$/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

const blank = (): Payload => ({
  signedIn: false, cartCount: 0, saved: [],
  needsMerge: false, owner: false, review: null,
});
