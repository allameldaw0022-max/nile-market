import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * ═══════════════════════════════════════════════════════════════════
 * حدّ التخزين في المتجر — ما يُخزَّن عامٌّ، وما يخصّ زائرًا لا يُخزَّن.
 *
 * هذه الاختبارات تحرس مقايضةً واحدة اتُّخذت بقياس: صفحات المتجر
 * العامة تتخلّى عن نونس CSP لتصبح قابلة للتخزين (النونس يتغيّر كل
 * طلب فيُلزم تصييرًا كاملًا لكل زائر). وما يجعل المقايضة مقبولة
 * شرطان لا ثالث لهما:
 *   ١) لا يدخل الـHTML المخزَّن أيّ بيان يخصّ زائرًا بعينه.
 *   ٢) ولا يتخلّى عن النونس إلا مسارٌ **مخزَّن فعلًا** وعامٌّ.
 * فإن سقط أحدهما صار التخزين تسريبًا أو صارت السياسة إضعافًا بلا
 * مقابل. ولذلك تُختبر البنية هنا لا النيّة.
 * ═══════════════════════════════════════════════════════════════════
 */

const LAYOUT = code('../src/app/(storefront)/sites/[host]/layout.tsx');
const PROXY = code('../src/proxy.ts');

test('★★★ تخطيط المتجر لا يقرأ كوكيًّا ولا جلسةً ولا سلّة', () => {
  // أيٌّ من هذه يجعل كل صفحات المتجر تُصيَّر لكل طلب، ويُدخل بيان
  // زائرٍ بعينه في HTML يُخدَم لغيره.
  for (const forbidden of ['cookies(', 'getActor', 'loadCart', 'readCartToken',
                           'next/headers', 'createClient']) {
    assert.ok(!LAYOUT.includes(forbidden),
      `تخطيط المتجر يستعمل ${forbidden} — يُخرج الصفحات من التخزين`);
  }
});

test('★★★ الصفحات المخزَّنة لا تستعمل عميل الجلسة', () => {
  for (const page of ['page.tsx', 'products/[slug]/page.tsx',
                      'pages/[slug]/page.tsx', 'contact/page.tsx']) {
    const src = code(`../src/app/(storefront)/sites/[host]/${page}`);
    assert.ok(!src.includes("from '@/lib/supabase/server'"),
      `${page} يستعمل عميل الكوكيز — والصفحة مخزَّنة`);
    assert.ok(src.includes('generateStaticParams'),
      `${page} بلا generateStaticParams — لن تُخزَّن أصلًا`);
  }
});

test('★★★ عرض المنتجات لا يجلب مفضّلة ولا هوية', () => {
  const src = code('../src/components/storefront/ProductShowcase.tsx');
  assert.ok(!src.includes('wishlistStateFor'),
    'ProductShowcase يجلب المفضّلة — وهو يُستعمل في كل صفحة قائمة');
  assert.ok(!src.includes('getActor'),
    'ProductShowcase يقرأ الهوية — يُخرج الرئيسية والتصنيف والبحث من التخزين');
});

test('★★★ مسار /viewer لا يُخزَّن في أيّ طبقة', () => {
  const src = code('../src/app/(storefront)/sites/[host]/viewer/route.ts');
  assert.ok(src.includes("dynamic = 'force-dynamic'"),
    '/viewer بلا force-dynamic — قد يُخزَّن جوابٌ يخصّ زائرًا');
  assert.ok(/private,\s*no-store/.test(src),
    '/viewer بلا no-store — قد يستقرّ في متصفّح أو وسيط');
});

test('★★★ /viewer يشتقّ المتجر من المضيف لا من معامل العميل', () => {
  const src = code('../src/app/(storefront)/sites/[host]/viewer/route.ts');
  assert.ok(src.includes('resolveStoreByHost(host)'),
    'المتجر لا يُشتقّ من المضيف — جدار IDOR الأول');
  // السَلَك يُترجَم إلى معرّف **داخل هذا المتجر**: وإلا قرأ العميل
  // حالة تقييمٍ لمنتج متجر آخر بإرسال سَلَكه.
  assert.ok(/eq\('store_id', storeId\)[\s\S]{0,80}eq\('slug', slug\)/.test(src),
    'ترجمة السَلَك غير محصورة بالمتجر');
  assert.ok(!/searchParams\.get\('p'\)/.test(src),
    'يقبل معرّف منتج من العميل مباشرةً بدل السَلَك المحصور');
});

/**
 * قائمة المسارات التي تتخلّى عن النونس تُثبَّت هنا حرفيًا.
 *
 * ★ إضافة مسار إليها قرارٌ أمني: يعني أنّ سياسة سكربتاته ستقبل
 * `unsafe-inline`. فالاختبار يفشل عند أيّ توسيع غير مقصود — وهذا
 * بالضبط غرضه.
 */
test('★★★ النونس لا يُسقَط إلا عن المسارات العامة المخزَّنة', () => {
  assert.ok(PROXY.includes('function isCachedStorePath'),
    'لا دالّة صريحة تحدّد المسارات المخزَّنة');
  const body = PROXY.slice(PROXY.indexOf('function isCachedStorePath'));
  const decl = body.slice(0, body.indexOf('\n}') + 2);

  // المسموح: الرئيسية، تواصل، صفحة منتج بعينه، صفحات السياسات
  assert.ok(decl.includes("pathname === '/'"), 'الرئيسية غير مشمولة');
  assert.ok(decl.includes("pathname === '/contact'"), 'تواصل غير مشمولة');
  assert.ok(decl.includes('/products\\\\/[^/]+') || decl.includes('products'),
    'صفحة المنتج غير مشمولة');
  assert.ok(decl.includes("startsWith('/pages/')"), 'صفحات السياسات غير مشمولة');

  // الممنوع قطعًا: كل ما يلمس هويّة أو مالًا
  for (const personal of ['/cart', '/checkout', '/account', '/login', '/wishlist',
                          '/orders', '/order', '/reset-password', '/viewer',
                          '/dashboard', '/admin', '/partner']) {
    assert.ok(!decl.includes(`'${personal}'`),
      `مسار شخصي (${personal}) يتخلّى عن النونس`);
  }
  // ★ صفحات القوائم صارت مخزَّنة (الخيار ب): العرض الافتراضي يُصيَّر
  // خادميًا ويُخزَّن، والترقيم/الترتيب/البحث تأتي من `/api/products`.
  // فهي عامّة تمامًا — لا كوكيز ولا جلسة — ومن ثمّ إسقاط النونس عنها
  // مقابله حقيقي (تخزين الصفحة) لا إضعاف بلا مقابل.
  for (const cachedList of ["'/products'", "'/search'", '/categories']) {
    assert.ok(decl.includes(cachedList),
      `${cachedList} صفحة عامّة مخزَّنة ومع ذلك تُصيَّر ديناميكيًا`);
  }
  // لكن المعالج نفسه ليس صفحة ولا يُسقَط عنه النونس عبر هذه الدالّة
  assert.ok(!decl.includes("'/api"),
    'المعالج /api أُدرج في مسارات الصفحات المخزَّنة');
});

test('★★ النونس يُوضَع على ترويسة الطلب للمسارات الديناميكية وحدها', () => {
  // وضع ترويسة CSP على الطلب هو ما يجعل Next يحقن نونسًا في الـHTML.
  // فعلُ ذلك لصفحة مخزَّنة يزرع نونس لحظةٍ في HTML يُخدَم لاحقًا.
  assert.ok(/if \(nonce\) \{[\s\S]{0,200}requestHeaders\.set\('Content-Security-Policy'/
    .test(PROXY), 'ترويسة CSP تُوضَع على الطلب بلا شرط النونس');
  assert.ok(/const nonce = cacheable \? null :/.test(PROXY),
    'النونس لا يُشتقّ من قابلية التخزين');
});

test('★★ تسجيل الزيارة خارج شجرة التصيير', () => {
  assert.ok(PROXY.includes('track_store_visit'),
    'تسجيل الزيارة ليس في الـproxy — فيُفقد للصفحات المخزَّنة');
  assert.ok(/after\(async \(\) => \{/.test(PROXY),
    'التسجيل ليس داخل after — يؤخّر جواب كل صفحة');
});

/**
 * ═══════════════════════════════════════════════════════════════════
 * مسار قائمة المنتجات — جوابه **علنيّ** فحدوده أضيق من غيره.
 *
 * `/api/products` يخرج بـ`Cache-Control: public` لأنّ جوابه دالّةٌ في
 * (المضيف + معاملات الاستعلام) وحدها. وهذا يجعل أيّ تسرّب فيه أخطر:
 * قراءةُ كوكيٍّ واحد هنا تعني أنّ ذاكرةً مشتركة قد تُسلّم جواب زائرٍ
 * لزائر آخر. فالحدود تُحرَس بنيويًّا لا بالنيّة.
 * ═══════════════════════════════════════════════════════════════════
 */
const LIST_API = code('../src/app/(storefront)/sites/[host]/api/products/route.ts');

test('★★★ مسار القائمة لا يقرأ كوكيًّا ولا جلسة', () => {
  for (const forbidden of ['cookies(', 'next/headers', 'getActor',
                           '@/lib/supabase/server', 'auth.getUser']) {
    assert.ok(!LIST_API.includes(forbidden),
      `مسار القائمة يستعمل ${forbidden} — وجوابه مخزَّن علنًا`);
  }
});

test('★★★ ويشتقّ المتجر من المضيف لا من معامل العميل', () => {
  assert.ok(LIST_API.includes('resolveStoreByHost(host)'),
    'المتجر لا يُشتقّ من المضيف — جدار IDOR الأول');
  assert.ok(!/searchParams\.get\(['"]store/.test(LIST_API),
    'يقبل معرّف متجر من العميل');
  // التصنيف يُرسَل سَلَكًا ويُترجَم داخل هذا المتجر وحده
  assert.ok(/eq\('store_id', storeId\)[\s\S]{0,80}eq\('slug', slug\)/.test(LIST_API),
    'ترجمة سَلَك التصنيف غير محصورة بالمتجر');
  // سَلَك لا يُترجَم ⇒ لا نتائج، لا تجاهلُ الشرط
  assert.ok(/categorySlug && !categoryId/.test(LIST_API),
    'سَلَك تصنيف غير موجود لا يُردّ بقائمة المتجر كاملة');
});

test('★★★ وحدودٌ صريحة تمنع استنزاف القاعدة', () => {
  assert.ok(/MAX_PAGE\s*=\s*\d+/.test(LIST_API), 'لا حدّ أعلى للصفحة');
  assert.ok(/Math\.min\(MAX_PAGE/.test(LIST_API), 'الصفحة غير مقصوصة بالحدّ');
  assert.ok(!/searchParams\.get\(['"]size/.test(LIST_API),
    'حجم الصفحة يرسله العميل — يجب أن يكون ثابتًا في الخادم');
  assert.ok(/SORTS.*includes\(sortRaw\)|includes\(sortRaw\)/.test(LIST_API),
    'الترتيب بلا قائمة سماح');
  assert.ok(LIST_API.includes('searchTerm('), 'الكلمة بلا تنقية وحدّ طول');
});

test('★★★ الصفحات الثلاث لا تقرأ searchParams (وإلا خرجت من التخزين)', () => {
  for (const page of ['products/page.tsx', 'categories/[slug]/page.tsx',
                      'search/page.tsx']) {
    const src = code(`../src/app/(storefront)/sites/[host]/${page}`);
    assert.ok(!/await\s+searchParams/.test(src) && !/\bsearchParams\s*[,}]/.test(src),
      `${page} يقرأ searchParams — يُخرج المسار كلّه من التخزين`);
    assert.ok(src.includes('generateStaticParams'),
      `${page} بلا generateStaticParams — لن تُخزَّن`);
    assert.ok(src.includes('ProductBrowser'),
      `${page} لا تستعمل ProductBrowser`);
  }
});

test('★★★ والثلاث في قائمة المسارات المخزَّنة في الـproxy', () => {
  const body = PROXY.slice(PROXY.indexOf('function isCachedStorePath'));
  const decl = body.slice(0, body.indexOf('\n}') + 2);
  assert.ok(decl.includes("pathname === '/products'"), '/products غير مشمولة');
  assert.ok(decl.includes("pathname === '/search'"), '/search غير مشمولة');
  assert.ok(decl.includes('categories'), '/categories/<slug> غير مشمولة');
  // ومسار القائمة نفسه **ليس** صفحة مخزَّنة: يبقى بالنونس
  assert.ok(!decl.includes("'/api"), 'مسار القائمة أُدرج كصفحة مخزَّنة');
});

test('★★★ ولا كوكي على مسار ليس صفحة (Set-Cookie + public = تسريب)', () => {
  assert.ok(/const isPage = !NON_PAGE\.some/.test(PROXY),
    'لا تمييز بين الصفحات وغيرها في كتابة الكوكيز');
  assert.ok(/if \(isPage && request\.cookies\.get\(VIEWER_HINT_COOKIE\)/.test(PROXY),
    'تلميح الزائر يُكتب على مسارات ليست صفحات');
  assert.ok(/if \(isPage && \(!visitor/.test(PROXY),
    'توكن الزائر يُكتب على مسارات ليست صفحات');
  assert.ok(/NON_PAGE = \[[^\]]*'\/api'/.test(PROXY),
    "'/api' ليس في قائمة غير-الصفحات");
});

test('★★★ بديل الـSuspense هو المحتوى الحقيقي لا لافتة انتظار', () => {
  // `useSearchParams` في صفحة مخزَّنة يضع **البديل** في الـHTML المُصيَّر
  // مسبقًا. فبديلٌ فارغ = صفحة منتجات بلا منتج واحد للزاحف.
  const src = code('../src/components/storefront/ProductBrowser.tsx');
  const i = src.indexOf('<Suspense fallback=');
  assert.ok(i > 0, 'لا حدّ Suspense — البناء يفشل على صفحة ثابتة');
  const fb = src.slice(i, i + 400);
  assert.ok(fb.includes('DefaultGrid'),
    'بديل الـSuspense ليس الشبكة الحقيقية — يُفقد المحتوى من HTML');
  assert.ok(!/fallback=\{<(div|p|span)[^>]*>\s*(جارٍ|Loading|\.\.\.)/.test(fb),
    'البديل لافتة انتظار');
});

test('★★ عدد المنتجات لا يصير NaN من ترويسة غير متوقّعة', () => {
  const src = code('../src/lib/products/storefront.ts');
  assert.ok(/Number\.isFinite\(count\)/.test(src),
    '`count` يُشتقّ من `content-range` نصًّا: ترويسة غريبة تعطي NaN لا null');
});
