import { randomBytes } from 'node:crypto';
import { NextResponse, after, type NextRequest } from 'next/server';
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
/**
 * ★★ لماذا سياستان لا واحدة.
 *
 * النونس يتغيّر كل طلب، ولذلك يُلزم Next بتصيير **كل** صفحة من
 * جديد: الصفحة المخزَّنة تحمل نونس اللحظة التي صُنعت فيها، فلا
 * يطابق النونس في ترويسة الجواب التالي ⇒ تُحجب سكربتاتها كلّها.
 * وهذا موثَّق في دليل Next نفسه: «لاستخدام النونس يجب أن تكون
 * الصفحة مصيَّرة ديناميكيًا… التخزين المسبق وISR معطَّلان».
 *
 * وقِيس الأثر: كان سقف طبقة التطبيق ~٩٥ طلبًا/ثانية على أربع أنوية
 * لأن كل صفحة متجر تُصيَّر لكل زائر.
 *
 * فالمقايضة تُصرَف حيث تنفع:
 *   · **صفحات المتجر العامة** (الرئيسية، المنتجات، التصنيف، البحث،
 *     الصفحات الثابتة، تواصل) — محتواها واحد لكل الزوّار، ولا
 *     تحمل هويّة ولا مالًا ⇒ سياسة بلا نونس، فتُخزَّن.
 *   · **كل ما عداها** (السلة، الدفع، الحساب، الدخول، المفضّلة،
 *     تتبّع الطلب، اللوحات كلّها) ⇒ النونس و`strict-dynamic` كما هي.
 *
 * ★ وما لم يتغيّر في السياسة الأولى: `object-src 'none'` و
 *   `base-uri 'self'` و`form-action 'self'` و`frame-ancestors 'none'`
 *   و`default-src 'self'`. المتغيّر الوحيد أنّ `script-src` يقبل
 *   `'unsafe-inline'` بدل النونس — لأنّ حمولة React تُبَثّ في وسم
 *   `<script>` مضمّن بحجم ~١٨٥ ك.ب، ولا سبيل لتوقيعها بتلبيدة
 *   في جوابٍ مخزَّن (جُرِّب `experimental.sri`: يوقّع الملفات
 *   الخارجية فقط ويترك المضمّن بلا تلبيدة).
 *
 * ★ وحدود الخطر مقيسة لا مفترضة: مَصْرِف XSS الوحيد في الشجرة
 *   كلّها هو `JsonLd` وهو `application/ld+json` (لا يُنفَّذ) ومع
 *   ذلك يُهرِّب `<`. وكل نصّ آخر يمرّ بتهريب React.
 */
function buildCsp(nonce: string | null): string {
  const supabase = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin; }
    catch { return ''; }
  })();
  const ws = supabase.replace(/^https:/, 'wss:');
  const dev = process.env.NODE_ENV === 'development';

  const scripts = nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`
    : `'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`;

  return [
    "default-src 'self'",
    `script-src ${scripts}`,
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
  const reqHost = (request.headers.get('host') ?? '').toLowerCase();
  const reqPath = request.nextUrl.pathname;
  // صفحة متجر عامة ⇒ لا نونس، فتُخزَّن. غير ذلك ⇒ نونس لكل طلب.
  const cacheable = !isPlatformHost(reqHost) && isCachedStorePath(reqPath);
  const nonce = cacheable ? null : randomBytes(16).toString('base64');
  const csp = buildCsp(nonce);

  // Next يقرأ النونس من ترويسة الطلب ليضعه على سكربتاته. ولا تُوضع
  // الترويسة للصفحات المخزَّنة: وجودها وحده يجعل Next يحقن نونسًا
  // في HTML يُخدَم لاحقًا لزائر آخر بترويسة أخرى.
  const requestHeaders = new Headers(request.headers);
  if (nonce) {
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
  }

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

  // ★★ إحصاء الزيارة هنا لا في التخطيط.
  //
  // كان `trackVisit` يُنادى داخل تخطيط المتجر، فيقرأ `cookies()` و
  // `headers()` أثناء التصيير — وذلك وحده كان يُخرج كل صفحات المتجر
  // من التخزين. ونقله إلى هنا ليس تسوية بل تحسين مزدوج:
  //   · الـproxy يعمل **قبل** طبقة التخزين، فالزيارة تُحسب حتى حين
  //     تُخدَم الصفحة مخزَّنة — والإحصاء كان سيضيع لو بقي في التصيير.
  //   · والمسار الحقيقي وتوكن الزائر بين يديه أصلًا، فلا تمرير
  //     ترويسات ولا ثقة بما يرسله العميل.
  //
  // ★ و`after` تجعلها بعد الجواب: لا ينتظرها الزبون.
  // ★ والحدّ في القاعدة كما كان: `track_store_visit` تتجاهل الزيارة
  //   المكرّرة لنفس الزائر خلال دقيقة.
  // ★ الجلب المسبق ليس زيارة: Next يطلب حمولة الصفحة حين يمرّ
  //   الرابط أمام العين.
  // ★ ولا زيارة لمسارات ليست صفحات: `/viewer` و`sw.js` وبيان PWA.
  if (visitor
      && request.headers.get('next-router-prefetch') !== '1'
      && request.headers.get('rsc') !== '1'
      && !NON_PAGE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const seenPath = pathname.slice(0, 200);
    const token = visitor;
    after(async () => {
      try {
        const storeId = await storeIdForHost(supabase, host);
        if (!storeId) return;
        // القاعدة تتجاهل زيارة متجر غير عامّ (`app.is_store_public`)
        // وتتجاهل التكرار خلال دقيقة — فلا فحص هنا يكرّرها.
        await supabase.rpc('track_store_visit', {
          p_store_id: storeId, p_visitor_token: token, p_path: seenPath,
        });
      } catch {
        // زيارة غير مسجَّلة أهون من صفحة لا تُعرض
      }
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

/**
 * المسارات المخزَّنة فعلًا — وهي وحدها التي تتخلّى عن النونس.
 *
 * ★ القائمة تطابق ما يقوله بناء Next حرفيًا (`●`): الرئيسية، وصفحة
 * المنتج، والسياسات، وتواصل. أمّا `/products` و`/categories/…`
 * و`/search` فتقرأ `searchParams` (ترقيم وترتيب وكلمة بحث) فتبقى
 * ديناميكية ⇒ تبقى بالنونس. لا نُضعِف سياسة مسارٍ لا يستفيد.
 *
 * ★ قائمة سماح لا قائمة منع: مسارٌ جديد يُضاف للمتجر غدًا يبدأ
 * بالنونس، ولا يتخلّى عنه إلا بقرار صريح هنا ومعه
 * `generateStaticParams` في الصفحة. الخطأ في هذا الاتجاه يكلّف
 * أداءً؛ وفي الاتجاه الآخر يكلّف صفحةً مخزَّنة بسكربتات محجوبة.
 */
function isCachedStorePath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/contact') return true;
  // صفحة منتج بعينه فقط — لا `/products` نفسها (لها searchParams)
  if (/^\/products\/[^/]+\/?$/.test(pathname)) return true;
  return pathname.startsWith('/pages/');
}

/** مسارات ليست صفحات يراها زائر ⇒ لا تُحسب زيارة. */
const NON_PAGE = ['/viewer', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml'];

/**
 * ترجمة المضيف إلى معرّف المتجر، بذاكرة داخل العملية.
 *
 * ★ لماذا ذاكرة محلّية لا `unstable_cache`: هذا يعمل في الـproxy،
 * وواجهات تخزين Next غير متاحة فيه. والبيان المطلوب (مضيف ⟶ معرّف)
 * لا يتغيّر إلا عند تغيير دومين، فتخزينه دقيقتين آمن.
 *
 * ★ والنتيجة أنّ الإحصاء لا يكلّف نداءً: أوّل طلب على نسخة باردة
 * يترجم المضيف، وما بعده مجّانًا. ويجري كلّه داخل `after` بعد
 * الجواب، فلا يراه الزبون أصلًا.
 *
 * ★ لا يُخزَّن هنا شيء عن زائر: مضيفٌ ومعرّف متجر فقط، وكلاهما عامّ.
 */
const HOST_TTL = 120_000;
const hostCache = new Map<string, { id: string | null; at: number }>();

async function storeIdForHost(
  supabase: ReturnType<typeof createServerClient>, host: string,
): Promise<string | null> {
  const now = Date.now();
  const hit = hostCache.get(host);
  if (hit && now - hit.at < HOST_TTL) return hit.id;

  const { data } = await supabase
    .rpc('resolve_store_by_host', { p_host: host }).maybeSingle();
  const id = (data as { store_id?: string } | null)?.store_id ?? null;

  // حدٌّ على الحجم: نسخة واحدة قد ترى آلاف المضيفات
  if (hostCache.size > 500) hostCache.clear();
  hostCache.set(host, { id, at: now });
  return id;
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
