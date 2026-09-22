'use server';
import 'server-only';
import { updateTag } from 'next/cache';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { storeTag } from '@/lib/tenant/resolve';

/** تغيير حالة الطلب — يمر حصريًا بدالة القاعدة transition_order. */
export async function transitionOrder(
  storeId: string, orderId: string, to: string, reason?: string,
): Promise<ActionResult> {
  try {
    await requireStoreAccess(
      storeId,
      to === 'cancelled' ? 'orders:cancel' : 'orders:update',
    );

    const supabase = await createClient();
    const { error } = await supabase.rpc('transition_order', {
      p_order_id: orderId,
      p_to: to as never,
      p_reason: reason ?? undefined,
    });
    if (error) throw fromPostgres(error);

    updateTag(storeTag(storeId, 'orders'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/**
 * تسجيل دفعة على طلب.
 *
 * المبلغ يُرسل من الواجهة لأن الدفعة قد تكون جزئية، لكن القاعدة هي
 * التي تربطه بالطلب وتعيد حساب `paid_total` و`payment_status` في
 * `refresh_order_payment_totals` — الواجهة لا تكتب حالة دفع أبدًا.
 */
export async function recordOrderPayment(input: {
  storeId: string;
  orderId: string;
  method: 'cash_on_delivery' | 'bank_transfer' | 'bankak';
  amount: number;
  reference?: string;
  proofMediaId?: string | null;
  idempotencyKey: string;
}): Promise<ActionResult<{ paymentId: string }>> {
  try {
    if (!Number.isFinite(input.amount) || input.amount <= 0)
      throw errors.validation('أدخل مبلغًا أكبر من صفر', 'amount');
    if (!input.idempotencyKey) throw errors.validation('مفتاح الدفعة مفقود');

    await requireStoreAccess(input.storeId, 'orders:payment');

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('record_payment', {
      p_kind: 'order',
      p_target_id: input.orderId,
      p_method: input.method,
      p_amount: input.amount,
      p_reference: input.reference?.trim() || undefined,
      p_proof_media_id: input.proofMediaId ?? undefined,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw fromPostgres(error);
    if (!data) throw errors.internal();

    updateTag(storeTag(input.storeId, 'orders'));
    return ok({ paymentId: data as string });
  } catch (err) {
    return actionError(err);
  }
}
