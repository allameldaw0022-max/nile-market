import { authorizeCron } from '@/lib/cron/guard';
import { sweepPendingDomains } from '@/lib/jobs/sweep-domains';

/**
 * كنس الدومينات المنتظرة — كل ساعة.
 *
 * التباعد الحقيقي في القاعدة: هذا المسار يسأل عن المستحقّ للفحص، وقد
 * يعود بلا شيء في أغلب الساعات وهذا هو المتوقَّع.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (!auth.ok) return auth.response;

  const result = await sweepPendingDomains();
  return Response.json(result, {
    status: result.ok ? 200 : 500,
    headers: { 'cache-control': 'no-store' },
  });
}
