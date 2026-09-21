import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isPlatformHost } from '@/lib/config';

/**
 * Proxy (بديل middleware في Next.js 16، ويعمل على Node.js runtime).
 *
 * مسؤوليتان:
 *  1) تجديد جلسة Supabase.
 *  2) ★ توجيه المستأجر: Host → إعادة كتابة إلى /sites/<host>/...
 *
 * قواعد أمنية مفروضة هنا:
 *  - /sites/* مرفوض من دومين المنصة ⇒ لا انتحال مستأجر.
 *  - مسارات اللوحات مرفوضة على دومينات المستأجرين ⇒ 404 لا redirect
 *    (حتى لا يكشف وجودها).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // تجديد التوكن — لا يُحذف
  await supabase.auth.getUser();

  const host = (request.headers.get('host') ?? '').toLowerCase();
  const { pathname, search } = request.nextUrl;

  if (isPlatformHost(host)) {
    // منع الوصول المباشر إلى مسارات المستأجر من دومين المنصة
    if (pathname.startsWith('/sites')) {
      return new NextResponse(null, { status: 404 });
    }
    return response;
  }

  // ── دومين مستأجر ──
  const PLATFORM_ONLY = ['/dashboard', '/admin', '/partner', '/onboarding'];
  if (PLATFORM_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return new NextResponse(null, { status: 404 });
  }

  const url = request.nextUrl.clone();
  url.pathname = `/sites/${host}${pathname === '/' ? '' : pathname}`;
  url.search = search;

  const rewritten = NextResponse.rewrite(url, { request });
  response.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
  return rewritten;
}

export const config = {
  matcher: [
    // يستثني الأصول الثابتة حتى لا يُعطَّل تحميل CSS/JS/الصور
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)',
  ],
};
