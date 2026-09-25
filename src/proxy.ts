import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { config as platform, isPlatformHost } from '@/lib/config';
import { serialFromHost, serialFromPath } from '@/lib/partners/links';
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
/**
 * سياسة المحتوى (CSP).
 *
 * ★ `script-src` بـnonce و`strict-dynamic` لا بقائمة نطاقات: القائمة
 * تُلتفّ بأي ملف مرفوع على نطاق مسموح، والـnonce يتغيّر كل طلب فلا
 * يمكن تخمينه. وهذا هو الحاجز الفعلي ضد XSS المنعكس.
 *
 * ★ و`style-src` يقبل `unsafe-inline` عن قصد: الواجهة تستعمل خاصية
 * `style` المضمّنة (عرض شريط النجوم مثلًا)، ومنعها يكسر الصفحة
 * مقابل مكسب أمني ضئيل — الأنماط المضمّنة لا تنفّذ شفرة. الصرامة
 * تُصرف حيث تنفع: السكربتات.
 *
 * ★ `connect-src` يفتح مضيف Supabase وحده: المتصفّح يرفع الصور
 * ويجدّد الجلسة مباشرةً معه. و`frame-ancestors 'none'` يكرّر
 * `X-Frame-Options` للمتصفّحات الحديثة.
 */
function buildCsp(nonce: string): string {
  const supabase = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin; }
    catch { return ''; }
  })();
  const ws = supabase.replace(/^https:/, 'wss:');
  const dev = process.env.NODE_ENV === 'development';

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${supabase ? ` ${supabase}` : ''}`,
    "font-src 'self'",
    `connect-src 'self'${supabase ? ` ${supabase} ${ws}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  // نونس جديد لكل طلب — لا يُعاد استعماله ولا يُخمَّن
  const nonce = randomBytes(16).toString('base64');
  const csp = buildCsp(nonce);

  // Next يقرأ النونس من ترويسة الطلب ليضعه على سكربتاته
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  /** السياسة تُثبَّت على كل جواب يخرج من هنا مهما كان مساره. */
  const withCsp = <T extends NextResponse>(res: T): T => {
    res.headers.set('Content-Security-Policy', csp);
    return res;
  };

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // تجديد التوكن — لا يُحذف.
  //
  // ★ لكن لا يُنادى لزائر بلا جلسة أصلًا: `getUser()` بلا كوكي
  // جلسة لا يفعل شيئًا، ومعظم زوّار المتاجر كذلك. الفحص يوفّر
  // عملًا على كل طلب من كل زائر — وهو أكثر مسار تنفيذًا في المنصة.
  const hasSession = request.cookies.getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
  if (hasSession) await supabase.auth.getUser();

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

  /**
   * رقم الشريك ⟶ رمز الإحالة، من القاعدة وللشريك النشِط وحده.
   * شكلا الرابط القصير (`/1` و`1nilemarket.online`) يمرّان بها معًا.
   */
  const codeForSerial = async (value: number): Promise<string | null> => {
    try {
      const { data } = await supabase.rpc('partner_code_by_serial', {
        p_serial: value,
      });
      return typeof data === 'string' && data ? data : null;
    } catch (error) {
      console.error('[referral] تعذّر ترجمة الرابط القصير', error);
      return null;
    }
  };

  // ★ الرابط القصير بالمضيف: `1nilemarket.online` وأخواته.
  //
  // مدخل ثانٍ لنظام الإحالة القائم لا نظام ثانٍ: الرقم يُترجَم إلى
  // رمز الإحالة، ثم يُحوَّل الزائر إلى الدومين الجذر حاملًا `?ref=`
  // فتلتقطه الكتلة أعلاه. Last-touch ونافذة الثلاثين يومًا ومنع
  // الإسناد الذاتي تسري كما هي.
  //
  // ★ يُفحص قبل توجيه المستأجر: هذه المضيفات ليست متاجر، وبدون هذا
  // الفحص كانت ستُعاد كتابتها إلى `/sites/1nilemarket.online` ⇒ 404.
  const serial = serialFromHost(host);
  if (serial !== null) {
    const target = new URL(pathname === '/' ? '/' : pathname,
                           `https://${platform.rootDomain}`);
    target.search = search;
    const hop = withCsp(NextResponse.redirect(target, 302));

    const code = await codeForSerial(serial);
    if (code) {
      // ★ لا يُسجَّل شيء هنا: التحويل يحمل `?ref=` فيمرّ الطلب
      // التالي بنفس كتلة الالتقاط أعلاه. مسار إسناد واحد للأشكال
      // الثلاثة، فلا تختلف النتيجة بينها.
      target.searchParams.set('ref', code);
      return withCsp(NextResponse.redirect(target, 302));
    }
    return hop;
  }

  if (isPlatformHost(host)) {
    // منع الوصول المباشر إلى مسارات المستأجر من دومين المنصة
    if (pathname.startsWith('/sites')) {
      return withCsp(new NextResponse(null, { status: 404 }));
    }

    // ★ الرابط القصير `/1` · `/25` على الدومين الجذر.
    //
    // يُترجم الرقم إلى رمز الإحالة ثم يُحوَّل إلى `/?ref=CODE` —
    // أي إلى **نفس** كتلة الالتقاط التي يمرّ بها الرابط القديم.
    // لا نظام إسناد ثانٍ ولا فرق في النتيجة بين الأشكال الثلاثة.
    //
    // ★ رقم بلا شريك نشط لا يُحوَّل: يمضي الطلب كما هو فلا يجد
    // مسارًا مطابقًا، وتظهر صفحة 404 الموقع. لا نُنشئ إحالة من رقم
    // مخترَع، ولا نبتلع مسارًا ليس لنا.
    const pathSerial = serialFromPath(pathname);
    if (pathSerial !== null) {
      const code = await codeForSerial(pathSerial);
      if (code) {
        const target = new URL('/', request.nextUrl.origin);
        target.searchParams.set('ref', code);
        return withCsp(NextResponse.redirect(target, 302));
      }
    }

    return withCsp(response);
  }

  // ── دومين مستأجر ──
  const PLATFORM_ONLY = ['/dashboard', '/admin', '/partner', '/onboarding'];
  if (PLATFORM_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return withCsp(new NextResponse(null, { status: 404 }));
  }

  // ★ مسارات المصادقة المشتركة لا تُعاد كتابتها إلى مساحة المتجر.
  // `/auth/confirm` و`/auth/callback` تعيش في `src/app/auth/` خارج
  // مجموعة المتجر، فإعادة كتابتها إلى `/sites/<host>/auth/...` تعطي
  // 404 وتكسر تأكيد البريد والعودة من Google **على نطاق المتجر**.
  //
  // وهذا بالضبط ما يجعل الجلسة تُكتب على المضيف الصحيح: المعالج
  // يعمل على مضيف المتجر، فيكتب الكوكي عليه لا على المنصّة.
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    return withCsp(response);
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
  // ترويسات الطلب نفسها (فيها النونس) + مسار الزائر قبل إعادة الكتابة
  requestHeaders.set('x-nm-path', pathname);

  const rewritten = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  response.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
  return withCsp(rewritten);
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
