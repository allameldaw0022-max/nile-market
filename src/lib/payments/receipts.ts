'use server';
import 'server-only';
import { updateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePlatformAccess, requireStoreAccess } from '@/lib/authz/guards';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { storeTag } from '@/lib/tenant/resolve';
import { rpc, firstRow } from '@/lib/supabase/rpc';

/**
 * قراءة إيصالات التحويل والقرار فيها.
 *
 * ★ نظامان لا يختلطان هنا ولا في القاعدة:
 *   · `subscriptionProofUrl` — إيصال اشتراك المنصة. يقرأه موظف
 *     المنصة بصلاحية subscriptions:view، والقرار فيه
 *     `reviewSubscriptionRequest` في lib/admin.
 *   · `orderReceipts` / `reviewOrderPayment` — إيصال تحويل طلب في
 *     متجر. يقرأه عضو المتجر بصلاحية orders:payment وحده.
 * لا دالة هنا تقبل معرّفًا من النوع الآخر: كل واحدة تسأل القاعدة
 * بدالتها، والقاعدة تفحص الغرض والصلاحية معًا.
 *
 * ★ لا رابط عام لإيصال. المسار لا يأتي من المتصفح — يُقرأ من
 * القاعدة بعد فحص الصلاحية — ثم يُوقَّع لدقيقتين: يكفي لفتح الملف
 * ولا يصلح للمشاركة ولا للأرشفة.
 */

/** عمر الرابط الموقَّع بالثواني — نفس ما تعتمده مرفقات الدعم. */
const SIGNED_TTL = 120;

export type OrderReceipt = {
  paymentId: string;
  status: string;
  amount: number;
  reference: string | null;
  failedReason: string | null;
  submittedAt: string;
  confirmedAt: string | null;
  confirmedByName: string | null;
  mime: string;
  size: number;
};

/** إيصال طلب اشتراك — لموظف المنصة. */
export async function subscriptionProofUrl(
  requestId: string,
): Promise<ActionResult<{ url: string; mime: string }>> {
  try {
    await requirePlatformAccess('subscriptions', 'view');
    const supabase = await createClient();

    const { data, error } = await rpc(supabase, 'subscription_request_proof', {
      p_request_id: requestId,
    });
    if (error) throw fromPostgres(error);

    const row = firstRow(data);
    if (!row) throw errors.notFound('لا إيصال مرفق بهذا الطلب');

    const signed = await supabase.storage
      .from(row.bucket)
      .createSignedUrl(row.path, SIGNED_TTL);
    if (signed.error || !signed.data?.signedUrl) {
      throw errors.internal('تعذّر إنشاء رابط الإيصال');
    }
    return ok({ url: signed.data.signedUrl, mime: row.mime_type });
  } catch (err) {
    return actionError(err);
  }
}

/** إيصالات تحويل طلب — لعضو المتجر المخوّل بالدفعات. */
export async function orderReceipts(input: {
  storeId: string; orderId: string;
}): Promise<ActionResult<OrderReceipt[]>> {
  try {
    await requireStoreAccess(input.storeId, 'orders:payment');
    const supabase = await createClient();

    const { data, error } = await rpc(supabase, 'order_payment_proofs', {
      p_order_id: input.orderId,
    });
    if (error) throw fromPostgres(error);

    return ok((data ?? []).map((r) => ({
      paymentId: r.payment_id,
      status: r.payment_status,
      amount: Number(r.amount),
      reference: r.reference,
      failedReason: r.failed_reason,
      submittedAt: r.submitted_at,
      confirmedAt: r.confirmed_at,
      confirmedByName: r.confirmed_by_name,
      mime: r.mime_type,
      size: Number(r.size_bytes),
    })));
  } catch (err) {
    return actionError(err);
  }
}

/** رابط موقَّع لإيصال طلب بعينه. */
export async function orderReceiptUrl(input: {
  storeId: string; orderId: string; paymentId: string;
}): Promise<ActionResult<{ url: string; mime: string }>> {
  try {
    await requireStoreAccess(input.storeId, 'orders:payment');
    const supabase = await createClient();

    const { data, error } = await rpc(supabase, 'order_payment_proofs', {
      p_order_id: input.orderId,
    });
    if (error) throw fromPostgres(error);

    // المسار يُختار من صفوف هذا الطلب وحده ⇒ لا يفتح معرّف دفعة من
    // طلب آخر ملفًا لا يخصّه
    const row = (data ?? []).find((r) => r.payment_id === input.paymentId);
    if (!row) throw errors.notFound('الإيصال غير متاح');

    const signed = await supabase.storage
      .from(row.bucket)
      .createSignedUrl(row.path, SIGNED_TTL);
    if (signed.error || !signed.data?.signedUrl) {
      throw errors.internal('تعذّر إنشاء رابط الإيصال');
    }
    return ok({ url: signed.data.signedUrl, mime: row.mime_type });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * قرار التاجر في تحويل الزبون.
 *
 * ★ هذا هو ما يؤكّد الدفع. رفع الإيصال قبله لم يُغيّر مليمًا:
 * الدفعة كانت `pending` والطلب «بانتظار التحقق». والقاعدة — لا
 * الواجهة — هي التي تعيد حساب حالة الطلب من الدفعات بعد القرار.
 */
export async function reviewOrderPayment(input: {
  storeId: string; orderId: string; paymentId: string;
  action: 'approve' | 'reject'; reason?: string;
}): Promise<ActionResult> {
  try {
    await requireStoreAccess(input.storeId, 'orders:payment');
    if (input.action === 'reject' && !input.reason?.trim()) {
      throw errors.validation('اذكر سبب الرفض', 'reason');
    }

    const supabase = await createClient();
    const { error } = await rpc(supabase, 'review_order_payment', {
      p_payment_id: input.paymentId,
      p_action: input.action,
      p_reason: input.reason?.trim() || null,
    });
    if (error) throw fromPostgres(error);

    updateTag(storeTag(input.storeId, 'orders'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}
