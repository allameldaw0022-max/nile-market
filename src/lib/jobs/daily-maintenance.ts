import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { runHealthChecks } from '@/lib/jobs/health-check';
import { log } from '@/lib/observability/logger';

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

  // الفحص يجري في الحالتين: يوم تفشل فيه الصيانة هو أحوج الأيام إلى
  // معرفة أي مكوّن سقط، وفشله لا يُسقط المهمة.
  try {
    await runHealthChecks({ persist: true });
  } catch (healthError) {
    log.warn('maintenance.health_failed', {
      reason: healthError instanceof Error ? healthError.message : 'unknown',
    });
  }

  // ★ قياس الموارد مرّة يوميًا: كافٍ لمعرفة الاتجاه، ولا يُثقل القاعدة
  // بصفوف مراقبة. فشله لا يُسقط الصيانة.
  const usage = await supabase.rpc('record_resource_usage' as never);
  if (usage.error) {
    log.warn('maintenance.usage_failed', { reason: usage.error.message });
  }

  if (error) {
    log.error('maintenance.failed', { reason: error.message });
    return { ok: false, summary: null, error: error.message };
  }

  log.info('maintenance.done');
  return { ok: true, summary: (data ?? {}) as Record<string, unknown> };
}
