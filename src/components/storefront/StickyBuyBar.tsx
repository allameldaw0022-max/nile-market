'use client';
import { useEffect, useRef, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { formatMoney } from '@/lib/money/format';

/**
 * شريط شراء ثابت أسفل الشاشة على الهاتف.
 *
 * ★★ لماذا: زرّ «أضف إلى السلّة» يختفي مع أول تمرير نحو الوصف
 * والمراجعات والمنتجات المشابهة — وهي ثلثا الصفحة. فيبقى الزبون
 * يقرأ وما عنده طريق للشراء إلا أن يعود للأعلى.
 *
 * ★★ ولا يُكرّر زرّ الإضافة ولا منطق السلّة: يُمرّر إلى صندوق الشراء
 * ويضع التركيز فيه. تكرار الزرّ كان يعني حالةَ كمّيةٍ ومتغيّرٍ ثانية
 * تتعارض مع الأولى — زبونٌ يختار مقاسًا فوق ويشتري غيره تحت.
 *
 * ★ ويظهر فقط حين يغيب صندوق الشراء عن الشاشة، بـ`IntersectionObserver`
 * لا بمستمع تمرير: الأخير يوقظ الخيط في كل إطار.
 *
 * ★ والهاتف وحده (`sm:hidden`): على الحاسوب الزرّ مرئيّ بجانب الصورة.
 */
export function StickyBuyBar({ targetId, price, label }: {
  /** معرّف صندوق الشراء في الصفحة. */
  targetId: string;
  price: number;
  label: string;
}) {
  const [show, setShow] = useState(false);
  const seen = useRef(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        // ★ لا يظهر قبل أن يُرى الصندوق مرّة: فتحُ الصفحة على شريطٍ
        //   عائم قبل أن يرى الزبون الزرّ الأصلي إزعاجٌ لا مساعدة.
        if (entry.isIntersecting) seen.current = true;
        setShow(seen.current && !entry.isIntersecting);
      },
      { rootMargin: '0px 0px -40% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  const go = () => {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // ★ التركيز بعد التمرير: من يستعمل لوحة المفاتيح أو قارئ شاشة
    //   يصل إلى الصندوق نفسه لا إلى أعلى الصفحة.
    const focusable = el.querySelector<HTMLElement>('button, input, [tabindex]');
    window.setTimeout(() => focusable?.focus({ preventScroll: true }), 400);
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95
                 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3
                 backdrop-blur sm:hidden"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] text-ink-500">{label}</p>
          <p className="text-[17px] font-extrabold tabular leading-tight text-teal-700">
            {formatMoney(price)}
          </p>
        </div>
        <button
          type="button"
          onClick={go}
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-md bg-teal-700
                     px-6 text-[15px] font-bold text-white transition-colors
                     hover:bg-teal-800"
        >
          <ShoppingBag size={17} aria-hidden />
          اطلب الآن
        </button>
      </div>
    </div>
  );
}
