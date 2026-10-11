import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { storeTag } from '@/lib/tenant/resolve';

export type DeliverySummary = {
  /** أرخص أجرة توصيل بين المناطق المفعّلة. */
  minFee: number;
  zoneCount: number;
  /** أدنى عتبة توصيل مجاني، أو `null` إن لم يضع التاجر واحدة. */
  freeOver: number | null;
  etaMin: number | null;
  etaMax: number | null;
};

/**
 * ملخّص التوصيل المعروض في صفحة المنتج.
 *
 * ★★ لماذا: مفاجأة أجرة الشحن عند الدفع هي السبب الأول لترك السلّة.
 * والمناطق وأجورها موجودة في `delivery_zones` منذ 0003 ولم تكن تُعرض
 * قبل خطوة الدفع إطلاقًا.
 *
 * ★ عميل بلا كوكيز + تخزين: الأجور بيانٌ عامّ واحد لكل الزوّار، فلا
 * يجوز أن يمنع جلبُه تخزينَ الصفحة. والوسم `settings` هو نفسه الذي
 * تُبطله أفعال التوصيل (`delivery/actions.ts`) ⇒ تعديل التاجر يظهر
 * فورًا بلا انتظار انتهاء مدّة التخزين.
 *
 * ★ ويفشل مفتوحًا: صفحةُ منتجٍ بلا سطر توصيل أهون من صفحة لا تُفتح.
 */
export function storeDelivery(storeId: string) {
  return unstable_cache(
    async (): Promise<DeliverySummary | null> => {
      const supabase = createPublicClient();
      const { data } = await supabase
        .from('delivery_zones')
        .select('fee, min_order_free, est_days_min, est_days_max')
        .eq('store_id', storeId).eq('is_active', true).is('deleted_at', null);

      const zones = data ?? [];
      if (zones.length === 0) return null;

      const num = (v: unknown) => (v == null ? null : Number(v));
      const fees = zones.map((z) => Number(z.fee)).filter(Number.isFinite);
      if (fees.length === 0) return null;

      // ★ العتبة المعروضة هي أدناها: «مجانًا فوق X» يجب أن تصدق على
      //   منطقةٍ واحدة على الأقل، وأدناها أوّل ما يتحقّق.
      const frees = zones.map((z) => num(z.min_order_free))
        .filter((n): n is number => n != null && Number.isFinite(n));
      const mins = zones.map((z) => num(z.est_days_min))
        .filter((n): n is number => n != null);
      const maxs = zones.map((z) => num(z.est_days_max))
        .filter((n): n is number => n != null);

      return {
        minFee: Math.min(...fees),
        zoneCount: zones.length,
        freeOver: frees.length > 0 ? Math.min(...frees) : null,
        etaMin: mins.length > 0 ? Math.min(...mins) : null,
        etaMax: maxs.length > 0 ? Math.max(...maxs) : null,
      };
    },
    ['sf-delivery', storeId],
    { revalidate: 300, tags: [storeTag(storeId, 'settings')] },
  );
}

/** يفشل مفتوحًا: لا سطر توصيل خيرٌ من صفحة لا تُفتح. */
export async function deliverySummary(storeId: string): Promise<DeliverySummary | null> {
  try { return await storeDelivery(storeId)(); }
  catch { return null; }
}
