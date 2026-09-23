'use server';
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { rpc } from '@/lib/supabase/rpc';

/** قياس فوري عند الطلب — الحاجز الحقيقي فحص الصلاحية داخل الدالة. */
export async function measureNow(): Promise<ActionResult<{ rows: number }>> {
  try {
    await requirePlatformAccess('system_health', 'view');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'record_resource_usage', {});
    if (error) throw fromPostgres(error);
    return ok({ rows: Number(data ?? 0) });
  } catch (err) {
    return actionError(err);
  }
}
