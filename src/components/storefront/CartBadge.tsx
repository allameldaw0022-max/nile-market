'use client';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useViewer } from './ViewerProvider';

export { CART_EVENT, publishCartCount } from './cartEvent';

/**
 * أيقونة السلة وعدّادها.
 *
 * ★ لماذا مكوّن عميل لأجل رقم: كان كل «أضف إلى السلة» ينادي
 * `router.refresh()` لتحديث هذا الرقم وحده، فيعيد الخادم بناء
 * المسار كلّه. قياسٌ فعلي: نقرة واحدة كانت تُنتج **١٩ نداءً** إلى
 * القاعدة. الآن الفعل يعيد العدد الحقيقي ويُطلقه حدثًا.
 *
 * ★★ ولماذا لم يبقَ العدد الأولي خادميًا: قراءة سلّة الزائر أثناء
 * التصيير تعني `cookies()` في التخطيط، وذلك وحده كان يمنع تخزين
 * **كل** صفحة متجر ويفرض تصييرًا كاملًا لكل طلب — وهو الاختناق
 * الذي قاسه اختبار الضغط (سقف ~٩٥ طلبًا/ثانية). فالعدد الآن يأتي
 * من `/viewer` بعد الإماهة.
 *
 * ★ والثمن معلوم ومقصود: زائرٌ لديه سلّة قائمة يرى الشارة بعد
 * جلبةٍ قصيرة لا مع أول بايت. وصفحة السلة نفسها تبقى خادميّة
 * وهي المرجع — الشارة إشارة لا مصدر حقيقة.
 */
export function CartBadge() {
  const { cartCount: count } = useViewer();

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
