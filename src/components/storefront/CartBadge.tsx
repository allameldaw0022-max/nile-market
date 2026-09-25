'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';

/** الحدث الذي يحمل عدد قطع السلة بعد كل تغيير. */
export const CART_EVENT = 'nm:cart-count';

/** يُطلقه كل فعل يغيّر السلة — العدد الحقيقي من القاعدة لا تخمين. */
export function publishCartCount(count: number) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<number>(CART_EVENT, { detail: count }));
}

/**
 * أيقونة السلة وعدّادها.
 *
 * ★ لماذا مكوّن عميل لأجل رقم: كان كل «أضف إلى السلة» ينادي
 * `router.refresh()` لتحديث هذا الرقم وحده، فيعيد الخادم بناء
 * المسار كلّه — التخطيط والصفحة والتقييمات والمنتجات المشابهة.
 * قياسٌ فعلي: نقرة واحدة كانت تُنتج **١٩ نداءً** إلى القاعدة
 * (وتسجّل زيارتين وهميّتين في الإحصاءات). الآن الفعل يعيد العدد
 * الحقيقي، ويسمعه هذا المكوّن وحده.
 *
 * ★ والعدد الأولي يأتي من الخادم كما كان: الصفحة تصل مرسومة
 * بالعدد الصحيح قبل أن يعمل أي جافاسكربت.
 */
export function CartBadge({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  const [lastServer, setLastServer] = useState(initial);

  // ★ العدد الخادمي هو المرجع: حين يصل رقم جديد من الخادم (تنقّل أو
  // إعادة بناء) يَجُبّ ما في الذاكرة. والضبط أثناء الرسم لا داخل
  // `useEffect` — هذا هو النمط الذي توصي به React لمزامنة الحالة
  // مع خاصيّة، ويتجنّب دورة رسم ثانية على كل تنقّل.
  if (lastServer !== initial) {
    setLastServer(initial);
    setCount(initial);
  }

  useEffect(() => {
    const onCount = (e: Event) => {
      const next = (e as CustomEvent<number>).detail;
      if (typeof next === 'number' && next >= 0) setCount(next);
    };
    window.addEventListener(CART_EVENT, onCount);
    return () => window.removeEventListener(CART_EVENT, onCount);
  }, []);

  return (
    <Link href="/cart"
          aria-label={count > 0 ? `السلة (${count})` : 'السلة'}
          className="relative grid size-11 place-items-center rounded-md
                     text-ink-700 transition-colors hover:bg-ink-100">
      <ShoppingBag size={20} aria-hidden />
      {count > 0 && (
        <span className="absolute top-1 end-1 grid min-w-[18px] place-items-center
                         rounded-full bg-teal-600 px-1 text-[10px] font-extrabold
                         leading-[18px] text-white tabular">
          {count}
        </span>
      )}
    </Link>
  );
}
