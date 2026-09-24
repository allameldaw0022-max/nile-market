import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { config as platform, isPlatformHost } from '@/lib/config';
import { serialFromHost } from '@/lib/partners/links';
import {
  REFERRAL_COOKIE, REFERRAL_MAX_AGE, VISITOR_COOKIE, VISITOR_MAX_AGE,
} from '@/lib/referral';

/**
 * Proxy (بديل middleware في Next.js 16، ويعمل على Node.js runtime).
 *
 * ثلاث مسؤوليات:
 *  1) تجديد جلسة Supabase.
 *  2) ★ توجيه المستأجر: Host → إعادة كتابة إلى /sites/<host>/...
 *  3) التقاط كوكي الإحالة من `?ref=` (D19).
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

  // ★ الإحالة: الكوكي HttpOnly يُكتب هنا خادميًا، والزيارة تُسجَّل في
  // القاعدة. قيمة هذا الكوكي تحدّد من يقبض عمولة اشتراكات هذا التاجر،
  // فلا يجوز أن يكتبها سكربت في الصفحة (D19).
  const ref = request.nextUrl.searchParams.get('ref');
  if (ref && ref.length <= 40 && /^[A-Za-z0-9_-]+$/.test(ref)) {
    // توكن الزائر يُولَّد مرة واحدة ويبقى 30 يومًا — نافذة الإسناد
    let token = request.cookies.get(REFERRAL_COOKIE)?.value;
    if (!token || token.length < 24) {
      token = randomBytes(32).toString('hex');
      response.cookies.set(REFERRAL_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: REFERRAL_MAX_AGE,
      });
    }

    // Last-touch: كل زيارة بكود جديد تُسجَّل، والقاعدة تأخذ الأحدث.
    // فشل التسجيل لا يعطّل الصفحة — الزائر ليس له علاقة بالعمولة.
    try {
      await supabase.rpc('record_referral_visit', {
        p_code: ref,
        p_visitor_token: token,
        p_landing_path: pathname,
        p_ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        p_user_agent: request.headers.get('user-agent') ?? null,
      });
    } catch (error) {
      console.error('[referral] تعذّر تسجيل الزيارة', error);
    }
  }

  // ★ الرابط القصير للشريك: `1nilemarket.online` وأخواته.
  //
  // مدخل ثانٍ لنظام الإحالة القائم لا نظام ثانٍ: الرقم يُترجَم في
  // القاعدة إلى رمز الإحالة، وتُسجَّل الزيارة بنفس الدالة، ثم
  // يُحوَّل الزائر إلى الموقع الرئيسي. Last-touch ونافذة الثلاثين
  // يومًا ومنع الإسناد الذاتي تسري كما هي.
  //
  // ★ يُفحص قبل توجيه المستأجر: هذه المضيفات ليست متاجر، وبدون هذا
  // الفحص كانت ستُعاد كتابتها إلى `/sites/1nilemarket.online` ⇒ 404.
  const serial = serialFromHost(host);
  if (serial !== null) {
    const target = new URL(pathname === '/' ? '/' : pathname,
                           `https://${platform.rootDomain}`);
    target.search = search;
    const hop = NextResponse.redirect(target, 302);

    try {
      const { data: code } = await supabase.rpc('partner_code_by_serial', {
        p_serial: serial,
      });
      if (typeof code === 'string' && code) {
        let token = request.cookies.get(REFERRAL_COOKIE)?.value;
        if (!token || token.length < 24) {
          token = randomBytes(32).toString('hex');
        }
        // الكوكي يُكتب على الدومين الجذر لا على الرابط القصير، وإلا
        // ضاع فور التحويل. (Domain= يسمح بذلك لأنهما دومينان مستقلان
        // فعليًا — ولهذا يُسجَّل الأثر في القاعدة أيضًا.)
        hop.cookies.set(REFERRAL_COOKIE, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: REFERRAL_MAX_AGE,
        });
        target.searchParams.set('ref', code);
        return NextResponse.redirect(target, 302);
      }
    } catch (error) {
      console.error('[referral] تعذّر ترجمة الرابط القصير', error);
    }
    return hop;
  }

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

  // ★ مسارات المصادقة المشتركة لا تُعاد كتابتها إلى مساحة المتجر.
  // `/auth/confirm` و`/auth/callback` تعيش في `src/app/auth/` خارج
  // مجموعة المتجر، فإعادة كتابتها إلى `/sites/<host>/auth/...` تعطي
  // 404 وتكسر تأكيد البريد والعودة من Google **على نطاق المتجر**.
  //
  // وهذا بالضبط ما يجعل الجلسة تُكتب على المضيف الصحيح: المعالج
  // يعمل على مضيف المتجر، فيكتب الكوكي عليه لا على المنصّة.
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    return response;
  }

  // ★ توكن الزائر للإحصاءات: عشوائي، HttpOnly، ولا يحمل أي معرّف
  // شخصي. غرضه الوحيد أن تُعدّ الزيارة مرّة لا مرّتين — لا تتبّع عبر
  // المتاجر: القيمة نفسها بلا معنى خارج جدول `store_visits`.
  let visitor = request.cookies.get(VISITOR_COOKIE)?.value;
  if (!visitor || visitor.length < 24) {
    visitor = randomBytes(24).toString('hex');
    response.cookies.set(VISITOR_COOKIE, visitor, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: VISITOR_MAX_AGE,
    });
  }

  const url = request.nextUrl.clone();
  url.pathname = `/sites/${host}${pathname === '/' ? '' : pathname}`;
  url.search = search;

  // التخطيط لا يرى المسار الأصلي بعد إعادة الكتابة — نمرّره ليُسجَّل
  // في الإحصاءات كما رآه الزائر لا كما أعيد كتابته
  const headers = new Headers(request.headers);
  headers.set('x-nm-path', pathname);

  const rewritten = NextResponse.rewrite(url, { request: { headers } });
  response.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
  return rewritten;
}

export const config = {
  matcher: [
    // يستثني الأصول الثابتة حتى لا يُعطَّل تحميل CSS/JS/الصور
    // `manifest.webmanifest` **ليس** مستثنًى: لكل متجر بيانه الخاص
    // ويجب أن يمرّ بإعادة الكتابة. و`sw.js` ملف ثابت في public
    // يُخدَم كما هو على كل الدومينات.
    '/((?!_next/static|_next/image|favicon.ico|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)',
  ],
};
