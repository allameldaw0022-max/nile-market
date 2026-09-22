import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * الصيانة اليومية.
 *
 * كل المنطق في `public.run_daily_maintenance()` بالقاعدة: كنس
 * الاشتراكات وتجميع التحليلات وإخفاء هوية الحسابات المستحقة وتنظيف
 * التذاكر وتحرير الـslugs المنتهية. الدالة مشتركة لـservice_role
 * وحده، وفشل خطوة لا يُسقط البقية.
 */
export async function runDailyMaintenance(): Promise<{
  ok: boolean; summary: Record<string, unknown> | null; error?: string;
}> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('run_daily_maintenance' as never);

  if (error) {
    console.error('[cron] فشلت الصيانة اليومية', error.message);
    return { ok: false, summary: null, error: error.message };
  }
  return { ok: true, summary: (data ?? {}) as Record<string, unknown> };
}
