import { authorizeCron } from '@/lib/cron/guard';
import { runDailyMaintenance } from '@/lib/jobs/daily-maintenance';

/** الصيانة اليومية — يُنادى من المجدول مرة كل يوم. */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (!auth.ok) return auth.response;

  const result = await runDailyMaintenance();
  return Response.json(result, {
    status: result.ok ? 200 : 500,
    headers: { 'cache-control': 'no-store' },
  });
}
