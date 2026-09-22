import 'server-only';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';

/**
 * توكن سلة الزائر.
 *
 * ★ HttpOnly: لا يقرأه سكربت في الصفحة، فلا يُسرَّب بـXSS ولا يُرسَل
 * في رابط. هو المفتاح الوحيد لملكية سلة بلا حساب، ولذلك 32 بايت
 * عشوائيًا (لا يُخمَّن) ويُولَّد على الخادم وحده.
 *
 * ★ لكل مضيف كوكي مستقل: سلة لكل متجر (D4)، فلا يرى متجر توكن غيره
 * ولا تتسرّب سلة بين متجرين على نفس المتصفح.
 */
const PREFIX = 'nm_cart_';

const keyFor = (host: string) =>
  PREFIX + host.toLowerCase().split(':')[0].replace(/[^a-z0-9.-]/g, '');

/** يقرأ التوكن إن وُجد — لا يُنشئ شيئًا (صالح لمسارات القراءة). */
export async function readCartToken(host: string): Promise<string | null> {
  const jar = await cookies();
  return jar.get(keyFor(host))?.value ?? null;
}

/**
 * يقرأ التوكن أو يُنشئه. يُستدعى من Server Action فقط — كتابة الكوكيز
 * غير مسموحة أثناء التصيير في Next.
 */
export async function ensureCartToken(host: string): Promise<string> {
  const jar = await cookies();
  const key = keyFor(host);
  const existing = jar.get(key)?.value;
  if (existing) return existing;

  const token = randomBytes(32).toString('hex');
  jar.set(key, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,   // 30 يومًا — مثل صلاحية السلة في القاعدة
  });
  return token;
}

export async function clearCartToken(host: string): Promise<void> {
  const jar = await cookies();
  jar.delete(keyFor(host));
}

/**
 * توكن الطلب الأخير — يفتح صفحة «تم الطلب» للزائر بلا حساب.
 * قصير العمر: الغرض عرض التأكيد لا تتبّع دائم (التتبّع برقم + هاتف).
 */
const ORDER_PREFIX = 'nm_order_';

const orderKeyFor = (host: string) =>
  ORDER_PREFIX + host.toLowerCase().split(':')[0].replace(/[^a-z0-9.-]/g, '');

export async function setLastOrder(
  host: string, orderNumber: string, guestToken: string,
): Promise<void> {
  const jar = await cookies();
  jar.set(orderKeyFor(host), `${orderNumber}:${guestToken}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function readLastOrder(
  host: string,
): Promise<{ orderNumber: string; guestToken: string } | null> {
  const jar = await cookies();
  const raw = jar.get(orderKeyFor(host))?.value;
  if (!raw) return null;
  const at = raw.indexOf(':');
  if (at <= 0) return null;
  return { orderNumber: raw.slice(0, at), guestToken: raw.slice(at + 1) };
}
