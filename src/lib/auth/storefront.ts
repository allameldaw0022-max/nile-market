'use server';
import 'server-only';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { recordLoginEvent } from '@/lib/auth/sessions';
import { rateLimit } from '@/lib/auth/rate-limit';
import { safeNext } from '@/lib/safe-next';

/**
 * مصادقة عميل المتجر.
 *
 * ★ الفكرة كلها في سطر واحد: `signInWithPassword` عبر **عميل الخادم**
 * يكتب كوكي الجلسة عبر `cookies()`، وكوكي بلا `domain` صريح مقصور
 * على مضيف الطلب. فحين يُنفَّذ هذا الفعل على
 * `store.nilemarket.online` تُكتب الجلسة على ذلك المضيف وحده — ولا
 * تُرى على متجر آخر ولا على المنصّة.
 *
 * فالعزل ليس شيئًا نضيفه، بل هو السلوك الافتراضي للكوكي. ولذلك
 * **لا يُوسَّع نطاق الكوكي إلى `.nilemarket.online`**: توسيعه يجعل
 * جلسة واحدة تسري على متاجر تجّار مختلفين، ويكسر النطاقات المخصّصة
 * تمامًا لأنها ليست تحت النطاق الجذر أصلًا.
 *
 * ★ ولهذا السبب نفسه يعمل الحلّ على النطاق المخصّص بلا أي استثناء:
 * لا شيء فيه يفترض شكل المضيف.
 *
 * ★ المتجر يُشتقّ من الـhost دائمًا، ولا يُقبل من نموذج ولا من رابط.
 */

const GENERIC_LOGIN_ERROR = 'بيانات الدخول غير صحيحة';

export type StoreAuthResult = { ok: boolean; message?: string };

async function clientKey() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

/** يتحقّق أن المضيف متجر قائم ونشط قبل أي عملية مصادقة عليه. */
async function requireStorefront(host: string) {
  const store = await resolveStoreByHost(host);
  if (!store || store.status !== 'active') {
    throw new Error('STORE_UNAVAILABLE');
  }
  return store;
}

export async function storefrontSignIn(
  _prev: StoreAuthResult | null, formData: FormData,
): Promise<StoreAuthResult> {
  const host = String(formData.get('host') ?? '');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  try {
    await requireStorefront(host);
  } catch {
    return { ok: false, message: 'المتجر غير متاح' };
  }

  if (!email.includes('@') || password.length === 0) {
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }

  const ip = await clientKey();
  // نفس حدّ المنصّة: ٥ محاولات / ١٥ دقيقة لكل (بريد + IP)
  if (!(await rateLimit(`login:${email}:${ip}`, 5, 900))) {
    return { ok: false, message: 'محاولات كثيرة — حاول بعد قليل' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // ★ لا تُميّز «بريد غير موجود» عن «كلمة مرور خاطئة» ⇒ لا تعداد حسابات
  if (error) return { ok: false, message: GENERIC_LOGIN_ERROR };

  await recordLoginEvent(null, 'password');
  redirect(safeNext(formData.get('next'), '/'));
}

export async function storefrontSignUp(
  _prev: StoreAuthResult | null, formData: FormData,
): Promise<StoreAuthResult> {
  const host = String(formData.get('host') ?? '');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('full_name') ?? '').trim();

  let store;
  try {
    store = await requireStorefront(host);
  } catch {
    return { ok: false, message: 'المتجر غير متاح' };
  }

  if (!email.includes('@')) return { ok: false, message: 'أدخل بريدًا إلكترونيًا صحيحًا' };
  if (password.length < 8) return { ok: false, message: 'كلمة المرور يجب ألا تقل عن ٨ أحرف' };
  if (fullName.length < 2) return { ok: false, message: 'أدخل اسمك' };

  const ip = await clientKey();
  if (!(await rateLimit(`signup:${ip}`, 3, 3600))) {
    return { ok: false, message: 'محاولات كثيرة — حاول بعد قليل' };
  }

  // ★ رابط التأكيد يعود إلى **هذا المضيف** لا إلى المنصّة: الجلسة
  // يجب أن تُكتب على مضيف المتجر، ورابط يعود إلى المنصّة كان
  // سيُسجّل الدخول في المكان الخطأ.
  //
  // ★ المضيف يُبنى من `store.primaryHost` المقروء من القاعدة، لا من
  // ترويسة `Host` مباشرةً: الترويسة يتحكّم بها الطالب، ووضعها في
  // `emailRedirectTo` يجعل رسالة التأكيد سلاحًا يُوجَّه إلى أي موقع.
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email, password,
    options: {
      // لا دور ولا صلاحية هنا — البيانات الوصفية يتحكم بها المستخدم (D7)
      data: { full_name: fullName },
      emailRedirectTo: `https://${store.primaryHost}/auth/confirm`,
    },
  });

  if (error) {
    // لا يُكشف أن البريد مسجّل مسبقًا
    if (error.message.toLowerCase().includes('already')) {
      return { ok: true, message: 'تحقّق من بريدك لإكمال التسجيل' };
    }
    return { ok: false, message: 'تعذّر إنشاء الحساب، حاول مجددًا' };
  }

  return { ok: true, message: 'أرسلنا رسالة تأكيد إلى بريدك. افتحها لتفعيل حسابك ثم سجّل الدخول.' };
}

export async function storefrontResetRequest(
  _prev: StoreAuthResult | null, formData: FormData,
): Promise<StoreAuthResult> {
  const host = String(formData.get('host') ?? '');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  let store;
  try {
    store = await requireStorefront(host);
  } catch {
    return { ok: false, message: 'المتجر غير متاح' };
  }

  const ip = await clientKey();
  if (!(await rateLimit(`reset:${ip}`, 3, 3600))) {
    return { ok: false, message: 'محاولات كثيرة — حاول بعد قليل' };
  }

  const supabase = await createClient();
  // النتيجة واحدة سواء وُجد البريد أو لا ⇒ لا تعداد حسابات
  //
  // ★ الوجهة `/auth/confirm` لا صفحة الاستعادة مباشرةً: هذا المعالج
  // هو الذي يبدّل رمز الاستعادة بجلسة **على مضيف المتجر** ثم يوجّه
  // إلى `/reset-password`. الذهاب إلى الصفحة رأسًا يعني صفحة بلا
  // جلسة، فترفض التعيين وتبدو كأن الرابط منتهٍ.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `https://${store.primaryHost}/auth/confirm`,
  });

  return { ok: true, message: 'إن كان البريد مسجّلًا فستصلك رسالة لإعادة التعيين.' };
}

export async function storefrontSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

/**
 * تعيين كلمة مرور جديدة بعد فتح رابط الاستعادة.
 *
 * ★ لا يُمرَّر بريد ولا معرّف: الجلسة المؤقّتة التي فتحها
 * `verifyOtp` هي الهوية. تمرير بريد هنا كان سيسمح بتغيير كلمة مرور
 * حساب آخر لمن يملك رابط استعادة صالحًا لحسابه هو.
 */
export async function storefrontUpdatePassword(
  _prev: StoreAuthResult | null, formData: FormData,
): Promise<StoreAuthResult> {
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) {
    return { ok: false, message: 'كلمة المرور يجب ألا تقل عن ٨ أحرف' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: 'انتهت صلاحية الرابط — اطلب رابطًا جديدًا' };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: 'تعذّر تحديث كلمة المرور' };

  redirect('/');
}
