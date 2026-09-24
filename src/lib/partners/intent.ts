import 'server-only';
import { cookies } from 'next/headers';

/**
 * نيّة الانضمام كشريك.
 *
 * ★ لماذا كوكي؟ تأكيد البريد يفتح رابطًا من الرسالة، ووجهته تُبنى
 * من `origin` لا من معامل (وهذا صحيح: لا مكان لقيمة يتحكّم بها من
 * أرسل الرابط). فالنيّة تُحفظ خادميًا قبل التسجيل، ويقرؤها معالج
 * التأكيد ليعيد صاحبها إلى بوابة الشراكة بدل لوحة التاجر.
 *
 * ★ HttpOnly وقصير العمر: إشارة تنقّل لا صلاحية. لا يمنح شيئًا —
 * `become_partner` تفحص الحساب في القاعدة على أي حال.
 *
 * ★ لا دالة حذف هنا عمدًا: الحذف يحتاج Server Action أو Route
 * Handler، والقارئ الوحيد صفحة تُصيَّر (فترمي E1180 إن حاولت).
 * الكوكي ينتهي من تلقائه، ولا أثر له بعد إنشاء الملف لأن صاحبه
 * يصير شريكًا فلا يُقرأ مرة أخرى.
 */
const COOKIE = 'nm_partner_intent';
const MAX_AGE = 60 * 60 * 2;   // ساعتان تكفيان لفتح رسالة التأكيد

export async function setPartnerIntent(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function hasPartnerIntent(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value === '1';
}

