'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { firstRow, rpc } from '@/lib/supabase/rpc';

/**
 * أفعال لوحة الإدارة.
 *
 * ★ كل فعل يبدأ بـ`requirePlatformAccess` الذي يفرض MFA (D28) ثم
 * مستوى الصلاحية. وكل دالة قاعدة تعيد الفحص بنفسها — فسقوط هذا
 * الجدار لا يفتح شيئًا.
 *
 * ★ فصل المهام ليس في هذا الملف: قيد CHECK في `partner_payouts` هو
 * الحاجز، ويسري على service_role أيضًا.
 */

export async function reviewSubscriptionRequest(input: {
  requestId: string; action: 'approve' | 'reject'; reason?: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    await requirePlatformAccess('subscriptions', 'approve');
    if (input.action === 'reject' && !input.reason?.trim())
      throw errors.validation('سبب الرفض إلزامي', 'reason');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'review_subscription_request', {
      p_request_id: input.requestId,
      p_action: input.action,
      p_reason: input.reason?.trim() || null,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/subscriptions');
    revalidatePath('/admin');
    return ok({ status: String(data?.status ?? input.action) });
  } catch (err) {
    return actionError(err);
  }
}

export async function reviewPayout(input: {
  payoutId: string; action: 'record' | 'approve' | 'reject'; reason?: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    // التسجيل يحتاج edit والاعتماد/الرفض يحتاج approve — والقاعدة
    // تعيد الفحص بدقة أكبر
    await requirePlatformAccess('payouts', input.action === 'record' ? 'edit' : 'approve');
    if (input.action === 'reject' && !input.reason?.trim())
      throw errors.validation('سبب الرفض إلزامي', 'reason');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'review_payout', {
      p_payout_id: input.payoutId,
      p_action: input.action,
      p_reason: input.reason?.trim() || null,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/payouts');
    revalidatePath('/admin');
    return ok({ status: String(data?.status ?? input.action) });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * تأكيد التحويل اليدوي.
 *
 * ★ الاعتماد ليس دفعًا: هذا الفعل هو ما يجعل الطلب مصروفًا ويوسم
 * العمولات المحجوزة له «مدفوعة». ولذلك يشترط مرجع تحويل — لا يُقيَّد
 * صرف بلا أثر يُراجَع.
 */
export async function markPayoutPaid(input: {
  payoutId: string; reference: string; note?: string;
}): Promise<ActionResult<{ linked: number }>> {
  try {
    await requirePlatformAccess('payouts', 'approve');
    if (!input.reference?.trim())
      throw errors.validation('أدخل مرجع التحويل', 'reference');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'mark_payout_paid', {
      p_payout_id: input.payoutId,
      p_reference: input.reference.trim(),
      p_note: input.note?.trim() || null,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/payouts');
    return ok({ linked: Number(data ?? 0) });
  } catch (err) {
    return actionError(err);
  }
}

export async function setStoreStatus(input: {
  storeId: string; status: 'active' | 'suspended' | 'closed' | 'pending_review';
  reason?: string;
}): Promise<ActionResult> {
  try {
    await requirePlatformAccess('stores', 'edit');
    if (input.status === 'suspended' && !input.reason?.trim())
      throw errors.validation('سبب الإيقاف إلزامي', 'reason');

    const supabase = await createClient();
    const { error } = await rpc(supabase, 'set_store_status', {
      p_store_id: input.storeId,
      p_status: input.status,
      p_reason: input.reason?.trim() || null,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/stores');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/**
 * ضبط سعر باقة.
 * `price_configured_at` يختمه trigger في القاعدة — الواجهة لا تكتبه،
 * وبدونه تبقى الباقة «غير مضبوطة» ولا تُباع (D18).
 */
export async function setPlanPrice(input: {
  planId: string; price: number; durationDays?: number;
}): Promise<ActionResult> {
  try {
    await requirePlatformAccess('plans', 'edit');
    if (!Number.isFinite(input.price) || input.price < 0)
      throw errors.validation('أدخل سعرًا صحيحًا', 'price');
    if (input.durationDays !== undefined
        && (!Number.isInteger(input.durationDays) || input.durationDays <= 0))
      throw errors.validation('مدة الباقة بالأيام يجب أن تكون أكبر من صفر', 'durationDays');

    const supabase = await createClient();
    const { error } = await supabase
      .from('plans')
      .update({
        price: input.price,
        ...(input.durationDays !== undefined
          ? { duration_days: input.durationDays } : {}),
      })
      .eq('id', input.planId);
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/plans');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/** ضبط حد أو ميزة في باقة. `limit=null` مع الضبط يعني «بلا حد». */
export async function setPlanEntitlement(input: {
  planId: string; featureKey: string;
  limitValue?: number | null; boolValue?: boolean | null;
}): Promise<ActionResult> {
  try {
    const actor = await requirePlatformAccess('plans', 'edit');
    if (input.limitValue !== undefined && input.limitValue !== null
        && (!Number.isInteger(input.limitValue) || input.limitValue < 0))
      throw errors.validation('الحد يجب أن يكون رقمًا صحيحًا غير سالب', 'limitValue');

    const supabase = await createClient();
    const { error } = await supabase
      .from('plan_entitlements')
      .update({
        limit_value: input.limitValue ?? null,
        bool_value: input.boolValue ?? null,
        updated_by: actor.userId,
      })
      .eq('plan_id', input.planId)
      .eq('feature_key', input.featureKey);
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/plans');
    revalidatePath('/admin');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/** تفعيل/إيقاف ميزة على مستوى المنصة. */
export async function setFeatureFlag(input: {
  key: string; enabled: boolean;
}): Promise<ActionResult> {
  try {
    const actor = await requirePlatformAccess('feature_flags', 'edit');
    const supabase = await createClient();
    const { error } = await supabase
      .from('feature_flags')
      .update({ enabled: input.enabled, updated_by: actor.userId })
      .eq('key', input.key);
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/flags');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/** إعدادات المنصة — بما فيها بوابة الإطلاق التجاري (D31). */
export async function savePlatformSettings(input: {
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
  commercialLaunchEnabled?: boolean;
  gracePeriodDays?: number;
  expiringWarningDays?: number;
  defaultPartnerRate?: number;
  supportEmail?: string | null;
  bankAccounts?: { bank: string; account: string; holder?: string }[];
  bankakNumber?: string | null;
  paymentInstructions?: string | null;
  legal?: Record<string, string>;
}): Promise<ActionResult> {
  try {
    const actor = await requirePlatformAccess('settings', 'manage');

    if (input.defaultPartnerRate !== undefined
        && (input.defaultPartnerRate < 0 || input.defaultPartnerRate > 100))
      throw errors.validation('نسبة العمولة بين 0 و100', 'defaultPartnerRate');
    if (input.gracePeriodDays !== undefined && input.gracePeriodDays < 0)
      throw errors.validation('فترة السماح لا تكون سالبة', 'gracePeriodDays');
    if (input.expiringWarningDays !== undefined && input.expiringWarningDays < 0)
      throw errors.validation('مدة التنبيه لا تكون سالبة', 'expiringWarningDays');

    // قائمة بيضاء صريحة: لا يمرّر النموذج عمودًا لم يُذكر هنا
    type SettingsPatch = {
      updated_by: string;
      maintenance_mode?: boolean;
      maintenance_message?: string | null;
      commercial_launch_enabled?: boolean;
      grace_period_days?: number;
      expiring_warning_days?: number;
      default_partner_rate?: number;
      support_email?: string | null;
      bank_accounts?: { bank: string; account: string; holder?: string }[];
      bankak_number?: string | null;
      payment_instructions?: string | null;
      legal?: Record<string, string>;
    };
    const patch: SettingsPatch = { updated_by: actor.userId };
    if (input.maintenanceMode !== undefined)
      patch.maintenance_mode = input.maintenanceMode;
    if (input.maintenanceMessage !== undefined)
      patch.maintenance_message = input.maintenanceMessage?.trim() || null;
    if (input.commercialLaunchEnabled !== undefined)
      patch.commercial_launch_enabled = input.commercialLaunchEnabled;
    if (input.gracePeriodDays !== undefined)
      patch.grace_period_days = Math.trunc(input.gracePeriodDays);
    if (input.expiringWarningDays !== undefined)
      patch.expiring_warning_days = Math.trunc(input.expiringWarningDays);
    if (input.defaultPartnerRate !== undefined)
      patch.default_partner_rate = input.defaultPartnerRate;
    if (input.supportEmail !== undefined)
      patch.support_email = input.supportEmail?.trim() || null;
    if (input.bankAccounts !== undefined)
      patch.bank_accounts = input.bankAccounts;
    if (input.bankakNumber !== undefined)
      patch.bankak_number = input.bankakNumber?.trim() || null;
    if (input.paymentInstructions !== undefined)
      patch.payment_instructions = input.paymentInstructions?.trim() || null;
    if (input.legal !== undefined) {
      // قائمة بيضاء صريحة: مفتاح غير معروف لا يُخزَّن، فلا تنشأ
      // «وثيقة» لا تعرضها أي صفحة
      const allowed = ['terms', 'privacy', 'subscription', 'cancellation'];
      const legal: Record<string, string> = {};
      for (const key of allowed) {
        const body = input.legal[key]?.trim();
        if (body) legal[key] = body;
      }
      patch.legal = legal;
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('platform_settings').update(patch).eq('id', true);
    // ★ بوابة الإطلاق التجاري يفرضها trigger في القاعدة: تفعيلها
    // بباقات غير مضبوطة يُرفض هناك لا هنا (D31).
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/**
 * الاستردادات.
 *
 * ★ فصل المهام (D30) في قيود CHECK على `refunds`: المبادِر والمسجِّل
 * والمعتمِد ثلاثة أشخاص مختلفون، والقيد يسري على service_role أيضًا.
 * هذه الأفعال تسهّل النداء ولا تحلّ محلّ القيد.
 */
export async function reviewRefund(input: {
  refundId: string; action: 'record' | 'approve' | 'reject'; reason?: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    await requirePlatformAccess('payments', input.action === 'record' ? 'edit' : 'approve');
    if (input.action === 'reject' && !input.reason?.trim())
      throw errors.validation('سبب الرفض إلزامي', 'reason');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'review_refund', {
      p_refund_id: input.refundId,
      p_action: input.action,
      p_reason: input.reason?.trim() || null,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/refunds');
    return ok({ status: String(data?.status ?? input.action) });
  } catch (err) {
    return actionError(err);
  }
}

/** إتمام الاسترداد: قيد الدفتر وعكس عمولة الشريك في معاملة واحدة. */
export async function completeRefund(input: {
  refundId: string; reference?: string;
}): Promise<ActionResult<{ status: string }>> {
  try {
    await requirePlatformAccess('payments', 'approve');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'complete_refund', {
      p_refund_id: input.refundId,
      p_reference: input.reference?.trim() || null,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/refunds');
    revalidatePath('/admin/payments');
    return ok({ status: String(data?.status ?? 'completed') });
  } catch (err) {
    return actionError(err);
  }
}

/** طلب استرداد يبادر به موظف منصة على دفعة. */
export async function requestRefund(input: {
  paymentId: string; amount: number; reason: string; idempotencyKey: string;
}): Promise<ActionResult<{ refundId: string }>> {
  try {
    await requirePlatformAccess('payments', 'approve');
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      throw errors.validation('أدخل مبلغًا صحيحًا', 'amount');
    if (input.reason.trim().length < 3)
      throw errors.validation('سبب الاسترداد إلزامي', 'reason');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'request_refund', {
      p_payment_id: input.paymentId,
      p_amount: input.amount,
      p_reason: input.reason.trim(),
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    revalidatePath('/admin/refunds');
    return ok({ refundId: row.refund_id });
  } catch (err) {
    return actionError(err);
  }
}
