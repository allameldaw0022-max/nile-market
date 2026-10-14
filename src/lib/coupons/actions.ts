'use server';
import 'server-only';
import { updateTag } from 'next/cache';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { storeTag } from '@/lib/tenant/resolve';
import { firstRow, rpc } from '@/lib/supabase/rpc';

/**
 * أكواد الخصم.
 *
 * الواجهة تنشئ الكود وتحدّد شروطه، لكنها **لا تحسب خصمًا أبدًا**:
 * الحساب كله في `validate_coupon` بالقاعدة وقت الطلب، وهي التي تتحقق
 * من الصلاحية وحد الاستخدام والحد الأدنى (D10).
 *
 * ★★★ والكتابة كلها في `save_coupon` بالقاعدة (0066). كانت هنا كتابةً
 * مباشرة على الجدول يسبقها نداءُ `assert_within_limit` — وهي دالّة في
 * سكيمة `app` لا يكشفها PostgREST، فكان كل إنشاء كودٍ نشط يفشل بـ«خطأ
 * غير متوقع» في كل متاجر المنصّة. ومنحة `insert` على `coupons` مسحوبة
 * الآن، فإعادة الكتابة المباشرة هنا تفشل فورًا لا بصمت.
 */

export type CouponInput = {
  storeId: string;
  couponId?: string | null;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrderAmount?: number | null;
  maxDiscountAmount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimitTotal?: number | null;
  usageLimitPerCustomer?: number | null;
  isActive?: boolean;
};

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export async function saveCoupon(
  input: CouponInput,
): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    const code = input.code.trim().toUpperCase();
    if (!CODE_RE.test(code))
      throw errors.validation(
        'الكود: حروف لاتينية وأرقام وشرطات، من 3 إلى 32 خانة', 'code');

    if (!Number.isFinite(input.value) || input.value <= 0)
      throw errors.validation('قيمة الخصم يجب أن تكون أكبر من صفر', 'value');
    if (input.type === 'percentage' && input.value > 100)
      throw errors.validation('نسبة الخصم لا تتجاوز 100%', 'value');
    if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt)
      throw errors.validation('تاريخ الانتهاء يجب أن يكون بعد البداية', 'endsAt');

    const { membership } = await requireStoreAccess(input.storeId, 'coupons:manage');
    const supabase = await createClient();

    const { data, error } = await rpc(supabase, 'save_coupon', {
      p_store_id: membership.storeId,
      p_code: code,
      p_type: input.type,
      p_value: input.value,
      p_coupon_id: input.couponId ?? null,
      p_min_order_amount: input.minOrderAmount ?? null,
      p_max_discount_amount: input.maxDiscountAmount ?? null,
      p_starts_at: input.startsAt || null,
      p_ends_at: input.endsAt || null,
      p_usage_limit_total: input.usageLimitTotal ?? null,
      p_usage_limit_per_customer: input.usageLimitPerCustomer ?? null,
      p_is_active: input.isActive ?? true,
    });
    if (error) throw fromPostgres(error);

    const row = firstRow(data);
    if (!row) throw errors.internal();

    updateTag(storeTag(membership.storeId, 'coupons'));
    return ok({ id: row.coupon_id, code: row.code });
  } catch (err) {
    return actionError(err);
  }
}

export async function setCouponActive(
  storeId: string, couponId: string, isActive: boolean,
): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'coupons:manage');
    const supabase = await createClient();
    // ★ عبر الدالّة لا بكتابةٍ مباشرة: إحياء كودٍ معطّل يزيد عدد الأكواد
    //   النشطة، فيلزمه فحص حدّ الباقة كما يلزم الإنشاء تمامًا.
    const { error } = await rpc(supabase, 'set_coupon_active', {
      p_store_id: membership.storeId,
      p_coupon_id: couponId,
      p_is_active: isActive,
    });
    if (error) throw fromPostgres(error);

    updateTag(storeTag(membership.storeId, 'coupons'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/**
 * حذف ناعم: `coupon_redemptions` تشير إلى الكود، وحذفه فعليًا يقطع
 * أثر خصم طُبّق على طلب حقيقي.
 */
export async function deleteCoupon(
  storeId: string, couponId: string,
): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'coupons:manage');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('coupons')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', couponId).eq('store_id', membership.storeId).is('deleted_at', null)
      .select('id');
    if (error) throw fromPostgres(error);
    if (!data || data.length === 0) throw errors.notFound();

    updateTag(storeTag(membership.storeId, 'coupons'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}
