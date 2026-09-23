import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { recordLoginEvent } from '@/lib/auth/sessions';
import { isPlatformHost } from '@/lib/config';

/**
 * تأكيد البريد / رابط الاستعادة (token_hash + type).
 * يُستخدم مع قوالب Supabase التي ترسل `{{ .TokenHash }}`.
 *
 * ★ الوجهة بعد النجاح تتبع المضيف: على نطاق متجر لا يوجد
 * `/onboarding` ولا `/reset-password` (الأول يحجبه الـproxy والثاني
 * صفحة منصّة)، فالتحويل إليهما كان سيرمي الزبون في 404 بعد أن
 * فعّل حسابه فعلًا.
 *
 * ★ الوجهة تُبنى من `origin` الطلب نفسه لا من معامل: لا مكان هنا
 * لقيمة يتحكّم بها من أرسل الرابط.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=invalid_link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=expired_link`);
  }

  await recordLoginEvent(request, type === 'recovery' ? 'recovery' : 'email_confirm');

  const onStore = !isPlatformHost((request.headers.get('host') ?? '').toLowerCase());

  // رابط الاستعادة يفتح جلسة مؤقتة ⇒ يُنقل لتعيين كلمة مرور جديدة.
  // المسار نفسه موجود على المنصّة وعلى المتجر، و`origin` يحسم أيّهما.
  if (type === 'recovery') return NextResponse.redirect(`${origin}/reset-password`);
  return NextResponse.redirect(
    onStore ? `${origin}/login?notice=confirmed` : `${origin}/onboarding?verified=1`);
}
