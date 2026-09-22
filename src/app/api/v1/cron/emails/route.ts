import { authorizeCron } from '@/lib/cron/guard';
import { drainEmailOutbox } from '@/lib/jobs/send-emails';

/**
 * تفريغ صندوق البريد — يُنادى من مجدول (Vercel Cron أو غيره).
 *
 * ★ الحماية: سرّ مشترك في ترويسة `authorization`. المسار مكشوف على
 * الإنترنت، وبلا هذا السرّ يستطيع أي أحد استنزاف حصة الإرسال.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = authorizeCron(request);
  if (!auth.ok) return auth.response;

  const result = await drainEmailOutbox(40);
  return Response.json({ ok: true, ...result }, {
    headers: { 'cache-control': 'no-store' },
  });
}
