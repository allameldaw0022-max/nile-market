/**
 * وجهة العودة بعد تسجيل الدخول: مسار داخلي أو لا شيء.
 *
 * ★ الثغرة التي يغلقها هذا الملف (مُثبتة بالتنفيذ): الفحص السابق كان
 * «يبدأ بـ `/` ولا يبدأ بـ `//` ولا يحوي `\`». حرف Tab يمرّ منه كلّه:
 *
 *     /<TAB>/evil.com   ⇒  يبدأ بـ / ✓ · لا يبدأ بـ // ✓ · لا \ ✓
 *
 * ثم يرسله Node في ترويسة Location كما هو (٣٠٢، لا خطأ)، ويحذف
 * المتصفّح حروف TAB و LF و CR من الرابط قبل تحليله وفق WHATWG URL،
 * فيصير `//evil.com` — أي عنوانًا مطلقًا على نطاق المهاجم.
 *
 * الأثر: المستخدم يفتح `https://<الموقع>/login?next=/%09/evil.com`،
 * فيرى نطاق سوق النيل الحقيقي، ويُدخل بياناته فعلًا، ثم يُقذف إلى
 * موقع المهاجم بعد نجاح الدخول. وهذا تمامًا ما يجعل Open Redirect
 * مضخِّمًا للتصيّد: الثقة تُبنى على النطاق الصحيح ثم تُصرف على غيره.
 *
 * `\n` و`\r` كان يرفضهما Node أصلًا (ERR_INVALID_CHAR ⇒ 500)، فالحرف
 * النافذ عمليًا هو TAB. ومع ذلك نرفض كل حروف التحكّم لا TAB وحده:
 * الحاجز يُبنى على قائمة بيضاء لا على إحصاء ما نجح اليوم.
 */

/** مسار داخلي: `/` ثم حروف مسار آمنة فقط. لا مخطّط ولا مضيف ولا تحكّم. */
const INTERNAL_PATH = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/;

export const DEFAULT_NEXT = '/dashboard';

export function safeNext(value: unknown, fallback: string = DEFAULT_NEXT): string {
  const raw = typeof value === 'string' ? value : String(value ?? '');

  // لا قصّ قبل الفحص: الحشو نفسه جزء من الحمولة هنا.
  if (raw.length === 0 || raw.length > 512) return fallback;

  // أي حرف تحكّم أو فراغ ⇒ مرفوض. المتصفّحات تحذف بعضها فيتغيّر
  // معنى الرابط بعد اجتيازه الفحص.
  if (/[\u0000- \u007F]/.test(raw)) return fallback;

  if (!raw.startsWith('/')) return fallback;   // لا نطاق خارجي
  if (raw.startsWith('//')) return fallback;   // لا رابط بروتوكول-نسبي
  if (raw.includes('\\')) return fallback;     // ويندوز/متصفّحات تعامله كـ /
  if (!INTERNAL_PATH.test(raw)) return fallback;

  return raw;
}
