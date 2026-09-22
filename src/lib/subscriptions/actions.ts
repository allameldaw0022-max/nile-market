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
 * الاشتراك: التاجر يطلب، وموظف المنصة يعتمد بعد التأكد من التحويل
 * (D16: لا تجديد آلي، ولا بوابة دفع في V1).
 *
 * الواجهة لا ترسل مبلغًا: `submit_subscription_request` تقرأ سعر
 * الباقة من `plans`، وترفض باقة لم يُضبط سعرها صراحةً (D18).
 */

export type PlanOption = {
  id: string; code: string; name: string; description: string | null;
  price: number; durationDays: number; isFree: boolean;
  priceConfigured: boolean;
  entitlements: { key: string; limit: number | null; bool: boolean | null;
                  configured: boolean }[];
};

export type CurrentSubscription = {
  planId: string; planName: string; status: string;
  currentPeriodEnd: string | null; graceEndsAt: string | null;
  startedAt: string;
};

export type SubscriptionRequestRow = {
  id: string; planName: string; netAmount: number; status: string;
  reference: string | null; createdAt: string; rejectionReason: string | null;
};

export async function loadSubscriptionPage(storeId: string): Promise<ActionResult<{
  current: CurrentSubscription | null;
  plans: PlanOption[];
  requests: SubscriptionRequestRow[];
}>> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'settings:view');
    const supabase = await createClient();

    const [{ data: sub }, { data: plans }, { data: entitlements }, { data: requests }] =
      await Promise.all([
        supabase.from('subscriptions')
          // `plans!plan_id`: للجدول مفتاحان إلى plans (الحالي والسابق)
          .select('plan_id, status, current_period_end, grace_ends_at, started_at, plans!plan_id(name)')
          .eq('store_id', membership.storeId).neq('status', 'cancelled').maybeSingle(),
        supabase.from('plans')
          .select('id, code, name, description, price, duration_days, is_free, price_configured_at')
          .eq('is_active', true).eq('is_public', true).order('sort_order'),
        supabase.from('plan_entitlements')
          .select('plan_id, feature_key, limit_value, bool_value, configured_at'),
        supabase.from('subscription_requests')
          .select('id, net_amount, status, reference, created_at, rejection_reason, plans(name)')
          .eq('store_id', membership.storeId)
          .order('created_at', { ascending: false }).limit(10),
      ]);

    const byPlan = new Map<string, PlanOption['entitlements']>();
    for (const e of entitlements ?? []) {
      const list = byPlan.get(e.plan_id) ?? [];
      list.push({
        key: e.feature_key,
        limit: e.limit_value,
        bool: e.bool_value,
        configured: e.configured_at !== null,
      });
      byPlan.set(e.plan_id, list);
    }

    const subPlan = sub?.plans as { name: string } | null;

    return ok({
      current: sub ? {
        planId: sub.plan_id,
        planName: subPlan?.name ?? '—',
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        graceEndsAt: sub.grace_ends_at,
        startedAt: sub.started_at,
      } : null,
      plans: (plans ?? []).map((p) => ({
        id: p.id, code: p.code, name: p.name, description: p.description,
        price: Number(p.price), durationDays: p.duration_days, isFree: p.is_free,
        // D18: غير مضبوط ⇒ لا يُعرض كقابل للشراء ولا يُفترض له سعر
        priceConfigured: p.price_configured_at !== null,
        entitlements: byPlan.get(p.id) ?? [],
      })),
      requests: (requests ?? []).map((r) => ({
        id: r.id,
        planName: (r.plans as { name: string } | null)?.name ?? '—',
        netAmount: Number(r.net_amount),
        status: r.status,
        reference: r.reference,
        createdAt: r.created_at,
        rejectionReason: r.rejection_reason,
      })),
    });
  } catch (err) {
    return actionError(err);
  }
}

export async function submitSubscriptionRequest(input: {
  storeId: string; planId: string; reference?: string;
  proofMediaId?: string | null; idempotencyKey: string;
}): Promise<ActionResult<{ requestId: string; netAmount: number }>> {
  try {
    if (!input.idempotencyKey) throw errors.validation('مفتاح الطلب مفقود');

    const { membership } = await requireStoreAccess(input.storeId, 'subscription:manage');
    const supabase = await createClient();

    const { data, error } = await rpc(supabase, 'submit_subscription_request', {
      p_store_id: membership.storeId,
      p_plan_id: input.planId,
      p_reference: input.reference?.trim() || null,
      p_proof_media_id: input.proofMediaId ?? null,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    updateTag(storeTag(membership.storeId, 'subscription'));
    return ok({ requestId: row.request_id, netAmount: Number(row.net_amount) });
  } catch (err) {
    return actionError(err);
  }
}

export async function cancelSubscriptionRequest(input: {
  storeId: string; requestId: string;
}): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'subscription:manage');
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'cancel_subscription_request', {
      p_request_id: input.requestId,
    });
    if (error) throw fromPostgres(error);

    updateTag(storeTag(membership.storeId, 'subscription'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/**
 * بيانات تحويل المنصة.
 * تأتي من دالة تُخرج هذه الحقول وحدها: صف `platform_settings` لا
 * يقرؤه التاجر لأنه يحوي إعدادات فصل المهام ومدد الاحتفاظ.
 */
export async function loadPlatformPaymentInfo(): Promise<ActionResult<{
  accounts: { bank?: string; account?: string; holder?: string }[];
  bankak: string | null;
  instructions: string | null;
}>> {
  try {
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'platform_payment_info', {});
    if (error) throw fromPostgres(error);

    const row = firstRow(data);
    return ok({
      accounts: Array.isArray(row?.bank_accounts) ? row.bank_accounts : [],
      bankak: row?.bankak_number ?? null,
      instructions: row?.payment_instructions ?? null,
    });
  } catch (err) {
    return actionError(err);
  }
}
