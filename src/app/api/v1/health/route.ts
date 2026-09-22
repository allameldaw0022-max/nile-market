import { runHealthChecks } from '@/lib/jobs/health-check';
import { authorizeCron } from '@/lib/cron/guard';

/**
 * نقطة فحص الصحة.
 *
 * ★ الرد العلني مختصر عمدًا: `{ ok, status }` بلا تفاصيل. تفصيل
 * الأعطال — أسماء المكوّنات ورسائل الأخطاء وزمن الاستجابة — يرسم
 * خريطة للبنية التحتية لمن يبحث عن ثغرة، فلا يُعطى إلا لمن يحمل سرّ
 * المراقبة.
 *
 * ★ الكتابة في سجل الفحوص لا تحدث إلا مع السرّ: مسار علني يكتب في
 * جدول هو باب إغراق.
 *
 * الرمز 503 عند التعطّل: مراقب خارجي يفهمه بلا قراءة الجسم.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = authorizeCron(request);
  const trusted = auth.ok;

  // آخر شبكة أمان: مهما انهار داخل الفحص، الرد يبقى فحصًا لا أثر خطأ
  const result = await runHealthChecks({ persist: trusted }).catch((error) => ({
    status: 'down' as const,
    checks: [{
      component: 'health_check', status: 'down' as const, latencyMs: 0,
      detail: error instanceof Error ? error.message : 'تعذّر إجراء الفحص',
    }],
  }));
  const status = result.status === 'down' ? 503 : 200;

  if (!trusted) {
    return Response.json(
      { ok: result.status !== 'down', status: result.status },
      { status, headers: { 'cache-control': 'no-store' } },
    );
  }

  return Response.json(result, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}
