import { authorizeCron } from '@/lib/cron/guard';
import { runUpkeep } from '@/lib/jobs/upkeep';

/**
 * الصيانة الساعيّة.
 *
 * ★ منفصلة عن الصيانة اليومية لأنّ ما فيها لا يحتمل يومًا: عدّادات
 * الحدّ تنمو بمعدّل الزيارات، وقراءة السعة لا تُفيد إلا كسلسلة.
 * وتستعمل نفس حارس المجدول ونفس السرّ — لا مسار جديد بلا حماية.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (!auth.ok) return auth.response;

  const result = await runUpkeep();
  return Response.json(result, {
    status: result.ok ? 200 : 500,
    headers: { 'cache-control': 'no-store' },
  });
}
