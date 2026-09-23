import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * تحديد المعدل خادميًا.
 *
 * ★ يحتاج `service_role` لأن `check_rate_limit` ممنوعة على العميل
 * (0013): محدِّد معدّل يستطيع المهاجم استدعاءه أو تصفيره ليس محدِّدًا.
 *
 * ★ ولهذا يعيش في ملفّ واحد صغير مهمّته هذه وحدها: كل من يحتاج
 * التحديد يستورده بدل أن يستورد عميل الخدمة بنفسه، فيبقى سطح تجاوز
 * RLS محصورًا في موضع واحد يسهل تدقيقه.
 *
 * ★ الفشل يُغلق لا يفتح: إن تعذّر الفحص نمنع المحاولة.
 */
export async function rateLimit(
  bucket: string, max: number, windowSeconds: number,
): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const { data } = await svc.rpc('check_rate_limit', {
      p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds,
    });
    return data !== false;
  } catch {
    return false;
  }
}
