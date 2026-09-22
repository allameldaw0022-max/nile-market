'use server';
import 'server-only';
import { updateTag } from 'next/cache';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { storeTag } from '@/lib/tenant/resolve';

/**
 * ملاحظات التاجر على العميل.
 *
 * 🔒 `customers.notes` لا تظهر للعميل في أي مسار: سياسات القراءة
 * الذاتية على الجدول تُرجع الصف لصاحبه، ولذلك لا تُعرض الملاحظات في
 * أي واجهة زبون — ولا يكتبها إلا من يملك `customers:update`.
 */
export async function saveCustomerNote(input: {
  storeId: string; customerId: string; notes: string;
}): Promise<ActionResult> {
  try {
    if (input.notes.length > 2000)
      throw errors.validation('الملاحظة طويلة جدًا', 'notes');

    const { membership } = await requireStoreAccess(input.storeId, 'customers:update');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('customers').update({ notes: input.notes.trim() || null })
      .eq('id', input.customerId).eq('store_id', membership.storeId)
      .is('deleted_at', null)
      .select('id');
    if (error) throw fromPostgres(error);
    if (!data || data.length === 0) throw errors.notFound();

    updateTag(storeTag(membership.storeId, 'customers'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}
