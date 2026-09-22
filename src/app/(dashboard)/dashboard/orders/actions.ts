'use server';
import 'server-only';
import { updateTag } from 'next/cache';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { fromPostgres } from '@/lib/authz/errors';
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
