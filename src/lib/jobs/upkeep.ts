import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { log } from '@/lib/observability/logger';

/**
 * صيانة متكرّرة — كل ساعة، لا كل يوم.
 *
 * ★★ سببها قياس لا تخطيط: `check_rate_limit` تُدرج صفًّا لكل (هويّة،
 * نافذة) على **كل** مسار كتابة — كل زيارة وكل طلب وكل تذكرة. و0056
 * جعلت الهويّة النشِطة تحذف نوافذها المنتهية بنفسها، فبقي صفٌّ واحد
 * لكل من يعود. أمّا من يزور مرّة ولا يعود فصفّه لا يحذفه أحد.
 *
 * ★ والحسبة هي التي تفرض «كل ساعة»: عند الحمل المستهدَف (١٠٠ ألف
 * مستخدم متزامن) تُنشأ ~١٠٠ ألف هويّة زيارة في الدقيقة. كنسٌ يوميّ
 * يترك ١٤٤ مليون صفٍّ قبل أن يعمل؛ وكنسٌ كل ساعة يحدّها بـ٦ ملايين —
 * وهي دون عتبة التنبيه (٢ مليون تُنبِّه، ١٠ ملايين حرجة) بهامش يُرى.
 *
 * ★ ومعها `store_visits` — الجدول الآخر الذي لا يُحذف منه شيء. كنسُه
 * محصور بما جُمِّع في `analytics_daily`، فلا يُفقد يومٌ لم يُجمَّع بعد.
 *
 * ★ ويُقاس مع كل جريان: `record_capacity` تكتب قراءة سعة، فتتكوّن
 * سلسلة ساعية تُظهر **اتجاه** الضغط لا لحظته — وهو ما يسبق الانهيار.
 */
export async function runUpkeep(): Promise<{
  ok: boolean; pruned: number; visitsPruned: number;
  capacity: string | null; error?: string;
}> {
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'إعداد ناقص';
    log.error('upkeep.misconfigured', { reason });
    return { ok: false, pruned: 0, visitsPruned: 0, capacity: null, error: reason };
  }

  let pruned = 0;
  let visitsPruned = 0;
  let capacity: string | null = null;
  let failed: string | undefined;

  // ★ كل خطوة في محاولتها: فشل التنظيف لا يمنع قراءة السعة، وفشل
  //   القراءة لا يمنع التنظيف. وصيانةٌ تنهار كلّها بخطأ واحد لا تُشغَّل.
  const { data: prunedRows, error: pruneError } =
    await supabase.rpc('prune_rate_limits' as never, {} as never);
  if (pruneError) {
    failed = pruneError.message;
    log.error('upkeep.prune_failed', { reason: pruneError.message });
  } else if (typeof prunedRows === 'number') {
    pruned = prunedRows;
  }

  const { data: visitRows, error: visitError } =
    await supabase.rpc('prune_store_visits' as never, {} as never);
  if (visitError) {
    failed ??= visitError.message;
    log.error('upkeep.visits_prune_failed', { reason: visitError.message });
  } else if (typeof visitRows === 'number') {
    visitsPruned = visitRows;
  }

  const { data: reading, error: capError } =
    await supabase.rpc('record_capacity' as never, {} as never);
  if (capError) {
    failed ??= capError.message;
    log.error('upkeep.capacity_failed', { reason: capError.message });
  } else {
    const level = (reading as { level?: string } | null)?.level ?? null;
    capacity = level;
    // ★ التنبيه المبكّر يُسجَّل بمستوى `warn` لا `info`: من يقرأ السجلّات
    //   يبحث عن `warn` قبل أن يسأله أحد عن سبب البطء.
    if (level === 'warn' || level === 'critical') {
      log.warn('upkeep.capacity_pressure', {
        level,
        alerts: JSON.stringify((reading as { alerts?: unknown }).alerts ?? []),
      });
    }
  }

  log.info('upkeep.done', { pruned, visitsPruned, capacity: capacity ?? 'unknown' });
  return { ok: !failed, pruned, visitsPruned, capacity, error: failed };
}
