import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { log } from '@/lib/observability/logger';

/**
 * فحص صحة المكوّنات.
 *
 * ★ الفحص **يقرأ فعلًا**: استعلام حقيقي على القاعدة، وعدّ حقيقي في
 * طابور البريد. فحص يعيد «سليم» دون أن يلمس شيئًا يطمئن ولا يخبر.
 *
 * ★ النتيجة تُكتب في `system_health_checks` عبر `record_health_check`
 * المشتركة لـservice_role وحده، فتظهر في صفحة صحة النظام.
 */
export type ComponentCheck = {
  component: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  detail?: string;
};

const SLOW_MS = 1500;

export async function runHealthChecks(options: { persist?: boolean } = {}) {
  const checks: ComponentCheck[] = [];

  // ★ إعداد ناقص يُبلَّغ عنه ولا يُرمى: نقطة فحص تنهار بـ500 حين يغيب
  // مفتاح هي أعطل ما في النظام وقت العطل، ولا تقول ما العطل.
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (error) {
    checks.push({
      component: 'configuration', status: 'down', latencyMs: 0,
      detail: error instanceof Error ? error.message : 'إعداد ناقص',
    });
    log.error('health.misconfigured', { components: 1 });
    return { status: 'down' as const, checks };
  }

  // القاعدة: استعلام صغير حقيقي
  const dbStarted = Date.now();
  try {
    const { error } = await supabase
      .from('plans').select('id', { count: 'exact', head: true });
    const latency = Date.now() - dbStarted;
    if (error) {
      checks.push({ component: 'database', status: 'down',
                    latencyMs: latency, detail: error.message });
    } else {
      checks.push({
        component: 'database',
        status: latency > SLOW_MS ? 'degraded' : 'healthy',
        latencyMs: latency,
        detail: latency > SLOW_MS ? 'زمن استجابة مرتفع' : undefined,
      });
    }
  } catch (error) {
    checks.push({
      component: 'database', status: 'down',
      latencyMs: Date.now() - dbStarted,
      detail: error instanceof Error ? error.message : 'تعذّر الاتصال',
    });
  }

  // طابور البريد: رسالة عالقة أكثر من ساعة ⇒ الطابور لا يُفرَّغ
  const mailStarted = Date.now();
  try {
    const [{ count: queued }, { count: failed }] = await Promise.all([
      supabase.from('email_outbox').select('id', { count: 'exact', head: true })
        .eq('status', 'queued')
        .lt('created_at', new Date(Date.now() - 3600_000).toISOString()),
      supabase.from('email_outbox').select('id', { count: 'exact', head: true })
        .eq('status', 'failed'),
    ]);
    const stuck = queued ?? 0;
    checks.push({
      component: 'email_queue',
      status: stuck > 0 ? 'degraded' : 'healthy',
      latencyMs: Date.now() - mailStarted,
      detail: stuck > 0
        ? `${stuck} رسالة عالقة أكثر من ساعة · ${failed ?? 0} فاشلة`
        : undefined,
    });
  } catch (error) {
    checks.push({
      component: 'email_queue', status: 'down',
      latencyMs: Date.now() - mailStarted,
      detail: error instanceof Error ? error.message : 'تعذّرت القراءة',
    });
  }

  // ★★ السعة: ضغطٌ يتشكّل قبل أن يصير عطلًا.
  //
  // كان الفحص يجيب «هل النظام يعمل؟» ولا يجيب «إلى متى؟». وقراءة
  // السعة (اتصالات، تنازع أقفال، أطول معاملة، إنتاجية، حجم، عدّادات
  // الحدّ) تُقيَّم في القاعدة بعتبات قابلة للضبط، و`warn` تصل هنا
  // `degraded` فيعلنها هذا المسار — فمراقبٌ خارجي يرى الضغط مبكّرًا
  // بلا أن يفتح لوحة.
  //
  // ★ القراءة وحدها هنا (`capacity_latest`)، والكتابة في الصيانة
  //   الساعيّة: فحص صحّة يُنادى من مراقب كل دقيقة لا يجوز أن يكتب
  //   سلسلةً في كل نداء.
  const capStarted = Date.now();
  try {
    const { data, error } = await supabase.rpc('capacity_latest' as never, {} as never);
    const rows = (data ?? []) as { metric: string; level: string; value: number }[];
    if (error) {
      checks.push({ component: 'capacity', status: 'degraded',
                    latencyMs: Date.now() - capStarted,
                    detail: 'تعذّرت قراءة السعة' });
    } else if (rows.length === 0) {
      checks.push({ component: 'capacity', status: 'degraded',
                    latencyMs: Date.now() - capStarted,
                    detail: 'لا قراءة سعة بعد — الصيانة الساعيّة لم تعمل' });
    } else {
      const bad = rows.filter((r) => r.level === 'warn' || r.level === 'critical');
      const critical = bad.some((r) => r.level === 'critical');
      checks.push({
        component: 'capacity',
        status: critical ? 'down' : bad.length > 0 ? 'degraded' : 'healthy',
        latencyMs: Date.now() - capStarted,
        detail: bad.length > 0
          ? bad.map((r) => `${r.metric}=${r.value} (${r.level})`).join(' · ')
          : undefined,
      });
    }
  } catch (error) {
    checks.push({
      component: 'capacity', status: 'degraded',
      latencyMs: Date.now() - capStarted,
      detail: error instanceof Error ? error.message : 'تعذّرت قراءة السعة',
    });
  }

  // إعداد البريد: مفتاح غائب يعني أن كل الرسائل ستفشل لاحقًا
  checks.push({
    component: 'email_provider',
    status: process.env.RESEND_API_KEY ? 'healthy' : 'degraded',
    latencyMs: 0,
    detail: process.env.RESEND_API_KEY ? undefined : 'RESEND_API_KEY غير مضبوط',
  });

  if (options.persist) {
    for (const check of checks) {
      const { error } = await supabase.rpc('record_health_check' as never, {
        p_component: check.component,
        p_status: check.status,
        p_latency_ms: check.latencyMs,
        p_detail: check.detail ?? null,
      } as never);
      if (error) log.warn('health.persist_failed', { component: check.component });
    }
  }

  const worst: 'down' | 'degraded' | 'healthy' =
    checks.some((c) => c.status === 'down') ? 'down'
      : checks.some((c) => c.status === 'degraded') ? 'degraded' : 'healthy';

  log.info('health.checked', {
    status: worst,
    components: checks.length,
    ms: checks.reduce((sum, c) => sum + c.latencyMs, 0),
  });

  return { status: worst, checks };
}
