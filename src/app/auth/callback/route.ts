import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recordLoginEvent } from '@/lib/auth/sessions';
import { isPlatformHost } from '@/lib/config';

/**
 * Google OAuth callback (PKCE).
 *
 * ★ `next` من قائمة بيضاء داخلية فقط — لا يُقبل أي مسار خارجي حتى لا
 * يُستخدم الرابط في Open Redirect.
 *
 * ★ المعالج يعمل على **مضيف الطلب**، فحين يعود Google إلى
 * `https://store.nilemarket.online/auth/callback` تُكتب الجلسة على
 * مضيف المتجر لا على المنصّة. أي أن المتجر يُستنتج من الـorigin
 * نفسه — لا من معامل يمكن تزويره — فيستحيل أن تعود جلسة متجر إلى
 * متجر آخر.
 *
 * ★ القائمة البيضاء تختلف بين المضيفين: مسارات المنصّة لا معنى لها
 * على متجر (يحجبها الـproxy)، ومسارات المتجر لا معنى لها على المنصّة.
 */
const PLATFORM_NEXT = new Set(['/dashboard', '/onboarding', '/account', '/partner',
                               '/partners/join', '/admin']);
const STORE_NEXT    = new Set(['/', '/account', '/wishlist', '/cart', '/products']);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const onStore = !isPlatformHost((request.headers.get('host') ?? '').toLowerCase());

  const allowed = onStore ? STORE_NEXT : PLATFORM_NEXT;
  const fallback = onStore ? '/' : '/dashboard';
  const requested = searchParams.get('next') ?? fallback;
  const next = allowed.has(requested) ? requested : fallback;

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
