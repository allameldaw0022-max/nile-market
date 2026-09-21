'use server';
import 'server-only';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { config } from '@/lib/config';

export type AuthResult = { ok: false; message: string } | { ok: true; message?: string };

/**
 * رسالة موحّدة لكل فشل في الدخول أو الاستعادة.
 * ★ لا تُميّز «بريد غير موجود» عن «كلمة مرور خاطئة» ⇒ لا تعداد حسابات
 * (المواصفات §6 + SECURITY.md §16.1).
 */
const GENERIC_LOGIN_ERROR = 'بيانات الدخول غير صحيحة';

/** تحديد المعدل خادميًا. الدالة في القاعدة ممنوعة على العميل (0013). */
async function rateLimit(bucket: string, max: number, windowSeconds: number) {
  try {
    const svc = createServiceClient();
    const { data } = await svc.rpc('check_rate_limit', {
      p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds,
    });
    return data !== false;
  } catch {
    // فشل الفاحص لا يفتح الباب: نمنع احتياطًا
    return false;
  }
}

async function clientKey() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function signIn(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { ok: false, message: 'أدخل البريد وكلمة المرور' };

  const ip = await clientKey();
  // 5 محاولات / 15 دقيقة لكل (بريد + IP) — API.md §12.6
  if (!(await rateLimit(`login:${email}:${ip}`, 5, 900))) {
    return { ok: false, message: 'محاولات كثيرة — حاول بعد قليل' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: GENERIC_LOGIN_ERROR };

  redirect('/dashboard');
}

export async function signUp(_prev: AuthResult | null, formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('full_name') ?? '').trim();

  if (!email.includes('@')) return { ok: false, message: 'أدخل بريدًا إلكترونيًا صحيحًا' };
  if (password.length < 8) return { ok: false, message: 'كلمة المرور يجب ألا تقل عن 8 أحرف' };
  if (fullName.length < 2) return { ok: false, message: 'أدخل اسمك الكامل' };

  const ip = await clientKey();
  if (!(await rateLimit(`signup:${ip}`, 3, 3600))) {
    return { ok: false, message: 'محاولات كثيرة — حاول بعد قليل' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email, password,
    options: {
      // ★ لا يُمرَّر أي دور أو صلاحية هنا: البيانات الوصفية يتحكم بها
      // المستخدم بالكامل. الأدوار تُمنح لاحقًا بعملية مدقَّقة (D7).
      data: { full_name: fullName },
      emailRedirectTo: `${config.siteUrl}/auth/confirm`,
    },
  });

  if (error) {
    // لا يُكشف أن البريد مسجّل مسبقًا
    if (error.message.toLowerCase().includes('already'))
      return { ok: true, message: 'تحقق من بريدك لإكمال التسجيل' };
    return { ok: false, message: 'تعذّر إنشاء الحساب، حاول مجددًا' };
  }

  return { ok: true, message: 'أرسلنا رسالة تأكيد إلى بريدك. افتحها لتفعيل حسابك.' };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestPasswordReset(
  _prev: AuthResult | null, formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const ip = await clientKey();
  if (!(await rateLimit(`reset:${email}:${ip}`, 3, 3600))) {
    return { ok: false, message: 'محاولات كثيرة — حاول بعد قليل' };
  }

  if (email.includes('@')) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${config.siteUrl}/reset-password`,
    });
  }

  // ★ الرد نفسه سواء وُجد البريد أو لا
  return { ok: true, message: 'إن كان البريد مسجّلًا لدينا فستصلك رسالة استعادة.' };
}
