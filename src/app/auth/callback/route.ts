import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recordLoginEvent } from '@/lib/auth/sessions';

/**
 * Google OAuth callback (PKCE).
 * `next` من قائمة بيضاء داخلية فقط — لا يُقبل أي مسار خارجي حتى لا
 * يُستخدم الرابط في Open Redirect.
 */
const SAFE_NEXT = new Set(['/dashboard', '/onboarding', '/account', '/partner', '/admin']);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const requested = searchParams.get('next') ?? '/dashboard';
  const next = SAFE_NEXT.has(requested) ? requested : '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  await recordLoginEvent(request, 'oauth');
  return NextResponse.redirect(`${origin}${next}`);
}
