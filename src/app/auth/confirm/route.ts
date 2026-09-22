import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { recordLoginEvent } from '@/lib/auth/sessions';

/**
 * تأكيد البريد / رابط الاستعادة (token_hash + type).
 * يُستخدم مع قوالب Supabase التي ترسل `{{ .TokenHash }}`.
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

  // رابط الاستعادة يفتح جلسة مؤقتة ⇒ يُنقل لتعيين كلمة مرور جديدة
  if (type === 'recovery') return NextResponse.redirect(`${origin}/reset-password`);
  return NextResponse.redirect(`${origin}/onboarding?verified=1`);
}
