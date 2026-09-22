/**
 * حارس مسارات cron.
 *
 * المسارات مكشوفة على الإنترنت، فالسرّ المشترك هو ما يمنع أي أحد من
 * استنزاف حصة البريد أو تشغيل صيانة تمسّ كل المتاجر.
 *
 * المقارنة بزمن ثابت: مقارنة `===` عادية تخرج عند أول اختلاف، فيسرّب
 * زمنُ الرد طولَ البادئة الصحيحة.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type CronCheck =
  | { ok: true }
  | { ok: false; response: Response };

export function authorizeCron(request: Request): CronCheck {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET غير مضبوط — المسار معطَّل');
    return {
      ok: false,
      response: Response.json({ ok: false, error: 'not_configured' }, { status: 503 }),
    };
  }

  const provided = request.headers.get('authorization') ?? '';
  if (!timingSafeEqual(provided, `Bearer ${secret}`)) {
    return { ok: false, response: Response.json({ ok: false }, { status: 401 }) };
  }
  return { ok: true };
}
