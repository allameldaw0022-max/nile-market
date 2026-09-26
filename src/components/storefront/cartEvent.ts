/**
 * حدث عدد قطع السلة.
 *
 * ★ في ملف مستقلّ لا داخل `CartBadge`: الشارة صارت تقرأ العدد من
 * `ViewerProvider`، والمزوّد يستمع لهذا الحدث — فلو بقي التعريف في
 * الشارة لصار الاستيراد دائريًا (شارة ← مزوّد ← شارة).
 */
export const CART_EVENT = 'nm:cart-count';

/** يُطلقه كل فعل يغيّر السلة — العدد الحقيقي من القاعدة لا تخمين. */
export function publishCartCount(count: number) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<number>(CART_EVENT, { detail: count }));
}
