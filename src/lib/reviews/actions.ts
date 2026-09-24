'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { getActor } from '@/lib/auth/actor';

export type ReviewResult = { ratingAvg: number | null; ratingCount: number };

/**
 * كتابة تقييم منتج أو تعديله.
 *
 * ★ هذا الفعل **لا يتحقّق** من الشراء: `submit_product_review` هي
 * التي تتحقّق، وهي المسار الوحيد للكتابة (لا منح INSERT على الجدول
 * لأحد). فحصٌ هنا يكون طمأنة مكرّرة لا حاجزًا، وفحصان يفترقان مع
 * أوّل تعديل يُطبَّق على أحدهما.
 *
 * ★ و`store_id` لا يُمرَّر من المتصفّح: القاعدة تشتقّه من المنتج.
 */
export async function submitProductReview(input: {
  host: string; productId: string; slug: string;
  rating: number; body?: string | null;
}): Promise<ActionResult<ReviewResult>> {
  try {
    const actor = await getActor();
    if (actor.kind !== 'user') {
      throw errors.forbidden('سجّل الدخول لتقييم المنتج');
    }

    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw errors.validation('اختر تقييمًا من نجمة إلى خمس نجوم', 'rating');
    }

    const store = await resolveStoreByHost(input.host);
    if (!store || store.status !== 'active') throw errors.notFound('المتجر غير متاح');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'submit_product_review', {
      p_product_id: input.productId,
      p_rating: input.rating,
      p_body: input.body?.trim() || null,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    // الصفحة مخزَّنة ٦٠ ثانية، والتقييم يجب أن يظهر لصاحبه فورًا
    revalidatePath(`/products/${input.slug}`);

    return ok({
      ratingAvg: row.rating_avg == null ? null : Number(row.rating_avg),
      ratingCount: row.rating_count,
    });
  } catch (err) {
    return actionError(err);
  }
}
