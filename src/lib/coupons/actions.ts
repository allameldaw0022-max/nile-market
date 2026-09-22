'use server';
import 'server-only';
import { updateTag } from 'next/cache';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { storeTag } from '@/lib/tenant/resolve';

/**
 * أكواد الخصم.
 *
 * الواجهة تنشئ الكود وتحدّد شروطه، لكنها **لا تحسب خصمًا أبدًا**:
 * الحساب كله في `validate_coupon` بالقاعدة وقت الطلب، وهي التي تتحقق
 * من الصلاحية وحد الاستخدام والحد الأدنى (D10).
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

    const patch = {
      code,
      type: input.type,
      value: input.value,
      min_order_amount: input.minOrderAmount ?? null,
      // سقف الخصم لا معنى له مع خصم ثابت
      max_discount_amount: input.type === 'percentage'
        ? (input.maxDiscountAmount ?? null) : null,
      starts_at: input.startsAt || null,
      ends_at: input.endsAt || null,
      usage_limit_total: input.usageLimitTotal ?? null,
      usage_limit_per_customer: input.usageLimitPerCustomer ?? null,
      is_active: input.isActive ?? true,
    };

    // حد الباقة على الأكواد النشطة — يُفحص قبل الإنشاء فقط
    if (!input.couponId && patch.is_active) {
      const { error: limitError } = await supabase.rpc('assert_within_limit' as never, {
        p_store_id: membership.storeId, p_key: 'coupons.max_active',
      } as never);
      if (limitError) throw fromPostgres(limitError);
    }

    const query = input.couponId
      ? supabase.from('coupons').update(patch)
          .eq('id', input.couponId).eq('store_id', membership.storeId)
          .is('deleted_at', null).select('id, code').single()
      : supabase.from('coupons').insert({ ...patch, store_id: membership.storeId })
          .select('id, code').single();

    const { data, error } = await query;
    if (error) throw fromPostgres(error);

    updateTag(storeTag(membership.storeId, 'coupons'));
    return ok({ id: data.id, code: data.code });
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
    const { data, error } = await supabase
      .from('coupons').update({ is_active: isActive })
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
