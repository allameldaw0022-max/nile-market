'use server';
import 'server-only';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { config } from '@/lib/config';
import { recordLoginEvent } from '@/lib/auth/sessions';

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

  await recordLoginEvent(null, 'password');
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


/** Google OAuth — PKCE. الوجهة تُحصر في مسارات داخلية في الـcallback. */
export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${config.siteUrl}/auth/callback?next=/dashboard`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error || !data.url) redirect('/login?error=oauth_failed');
  redirect(data.url);
}

/** إعادة إرسال رسالة تأكيد البريد. */
export async function resendVerification(
  _prev: AuthResult | null, formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const ip = await clientKey();
  if (!(await rateLimit(`resend:${email}:${ip}`, 3, 3600))) {
    return { ok: false, message: 'محاولات كثيرة — حاول بعد قليل' };
  }
  if (email.includes('@')) {
    const supabase = await createClient();
    await supabase.auth.resend({
      type: 'signup', email,
      options: { emailRedirectTo: `${config.siteUrl}/auth/confirm` },
    });
  }
  // الرد نفسه سواء وُجد البريد أو لا
  return { ok: true, message: 'إن كان البريد بحاجة إلى تأكيد فستصلك رسالة جديدة.' };
}

/** تعيين كلمة مرور جديدة — يتطلب جلسة استعادة سارية. */
export async function updatePassword(
  _prev: AuthResult | null, formData: FormData,
): Promise<AuthResult> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password.length < 8) return { ok: false, message: 'كلمة المرور يجب ألا تقل عن 8 أحرف' };
  if (password !== confirm) return { ok: false, message: 'كلمتا المرور غير متطابقتين' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'انتهت صلاحية الرابط — اطلب رابطًا جديدًا' };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: 'تعذّر تحديث كلمة المرور، حاول مجددًا' };

  return { ok: true, message: 'تم تحديث كلمة المرور بنجاح' };
}

/**
 * ★ تسجيل الخروج من كل الأجهزة (المواصفات §6/§29).
 * scope: 'global' يُبطل كل الـrefresh tokens للمستخدم على كل الأجهزة.
 */
export async function signOutAllDevices(): Promise<AuthResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'يجب تسجيل الدخول' };

  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) return { ok: false, message: 'تعذّر إنهاء الجلسات' };

  await supabase.from('user_sessions_meta')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', user.id).is('revoked_at', null);

  redirect('/login?signed_out=all');
}

// ── MFA / TOTP (D28) ────────────────────────────────────────────────

export type MfaEnrollState =
  | { ok: false; message: string }
  | { ok: true; factorId: string; qr: string; secret: string };

/** بدء تفعيل TOTP — يعيد QR وسرًّا نصيًا للنسخ اليدوي. */
export async function startMfaEnrollment(): Promise<MfaEnrollState> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `nile-${Date.now()}`,
  });
  if (error || !data) return { ok: false, message: 'تعذّر بدء التفعيل، حاول مجددًا' };
  return {
    ok: true,
    factorId: data.id,
    qr: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/** إكمال التفعيل بالرمز من التطبيق. */
export async function verifyMfaEnrollment(
  _prev: AuthResult | null, formData: FormData,
): Promise<AuthResult> {
  const factorId = String(formData.get('factor_id') ?? '');
  const code = String(formData.get('code') ?? '').replace(/\s/g, '');
  if (!factorId || code.length < 6) return { ok: false, message: 'أدخل الرمز المكوّن من 6 أرقام' };

  const supabase = await createClient();
  const { data: challenge, error: cErr } =
    await supabase.auth.mfa.challenge({ factorId });
  if (cErr || !challenge) return { ok: false, message: 'تعذّر التحقق، حاول مجددًا' };

  const { error } = await supabase.auth.mfa.verify({
    factorId, challengeId: challenge.id, code,
  });
  if (error) return { ok: false, message: 'الرمز غير صحيح' };

  return { ok: true, message: 'تم تفعيل التحقق بخطوتين' };
}

/** التحقق بخطوتين عند الدخول (يرفع الجلسة إلى aal2). */
export async function verifyMfaChallenge(
  _prev: AuthResult | null, formData: FormData,
): Promise<AuthResult> {
  const code = String(formData.get('code') ?? '').replace(/\s/g, '');
  if (code.length < 6) return { ok: false, message: 'أدخل الرمز المكوّن من 6 أرقام' };

  const ip = await clientKey();
  if (!(await rateLimit(`mfa:${ip}`, 10, 900))) {
    return { ok: false, message: 'محاولات كثيرة — حاول بعد قليل' };
  }

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (!totp) return { ok: false, message: 'لا يوجد تحقق بخطوتين مفعّل على هذا الحساب' };

  const { data: challenge, error: cErr } =
    await supabase.auth.mfa.challenge({ factorId: totp.id });
  if (cErr || !challenge) return { ok: false, message: 'تعذّر التحقق، حاول مجددًا' };

  const { error } = await supabase.auth.mfa.verify({
    factorId: totp.id, challengeId: challenge.id, code,
  });
  if (error) return { ok: false, message: 'الرمز غير صحيح' };

  redirect('/admin');
}

/**
 * إلغاء التحقق بخطوتين.
 * ⚠️ محجوب على حسابات Admin: D28 يجعل MFA إلزاميًا لها، والحارس
 * الخادمي يرفض الوصول بلا aal2 — فإلغاؤه يقفل الحساب عن لوحة الإدارة.
 */
export async function disableMfa(
  _prev: AuthResult | null, formData: FormData,
): Promise<AuthResult> {
  const factorId = String(formData.get('factor_id') ?? '');
  if (!factorId) return { ok: false, message: 'العامل غير محدد' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'يجب تسجيل الدخول' };

  const { data: adminMember } = await supabase
    .from('admin_members')
    .select('mfa_required').eq('profile_id', user.id)
    .eq('status', 'active').maybeSingle();

  if (adminMember?.mfa_required) {
    return {
      ok: false,
      message: 'التحقق بخطوتين إلزامي لحسابات الإدارة ولا يمكن إلغاؤه',
    };
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, message: 'تعذّر الإلغاء' };
  return { ok: true, message: 'تم إلغاء التحقق بخطوتين' };
}
