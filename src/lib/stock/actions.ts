'use server';
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { rpc } from '@/lib/supabase/rpc';
import { fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';

/**
 * تسجيل طلب «نبّهني عند التوفّر».
 *
 * ★★ لا `store_id` من العميل: القاعدة تشتقّه من المنتج. إرساله كان
 * سيسمح بتعليق بريدٍ على متجرٍ آخر — نفس جدار IDOR في بقيّة المتجر.
 *
 * ★ وكل تحقّق في القاعدة لا هنا: صحّة البريد، ونشر المنتج والمتجر،
 * وأنّه نافدٌ فعلًا، وحدّ المعدّل. فحصٌ في الواجهة وحدها يُتخطّى
 * بنداءٍ مباشر على المسار العامّ.
 */
export async function requestStockAlert(input: {
  productId: string; email: string;
}): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'request_stock_alert', {
      p_product_id: input.productId,
      p_email: input.email,
    });
    if (error) throw fromPostgres(error);
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}
