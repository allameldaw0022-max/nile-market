import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeNext } from '../src/lib/safe-next.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

/**
 * يقرأ الكود بلا تعليقات.
 *
 * ★ لازم هنا: هذه الملفّات تشرح في تعليقاتها **لماذا** لا نوسّع نطاق
 * الكوكي، فتذكر النطاق الجذر نصًّا. فحص النصّ الخام كان سيسقط على
 * الشرح نفسه — أي أن توثيق القرار يكسر الاختبار الذي يحرسه.
 */
function code(p: string): string {
  return read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')   // تعليقات الكتل
    .replace(/(^|[^:])\/\/.*$/gm, '$1');  // تعليقات السطر
}

/**
 * مصادقة عميل المتجر — الخصائص التي يجب ألا تنكسر.
 *
 * هذه اختبارات بنيوية تقرأ الكود نفسه: الاختبار السلوكي الكامل
 * يحتاج Supabase Auth حيًّا وهو محجوب هنا (مسجَّل في التقرير).
 */

test('★★★ لا يُوسَّع نطاق الكوكي إلى النطاق الجذر', () => {
  // توسيعه يجعل جلسة واحدة تسري على متاجر تجّار مختلفين،
  // ويكسر النطاقات المخصّصة لأنها ليست تحت الجذر أصلًا.
  for (const f of ['../src/lib/supabase/server.ts',
                   '../src/lib/supabase/client.ts',
                   '../src/lib/auth/storefront.ts',
                   '../src/proxy.ts']) {
    const src = code(f);
    assert.ok(!/domain\s*:/.test(src), `${f}: ضُبط نطاق كوكي صراحةً`);
    assert.ok(!src.includes('.nilemarket.online'), `${f}: نطاق جذر في الكود`);
  }
});

test('★★★ الجلسة لا تُخزَّن في localStorage', () => {
  for (const f of ['../src/lib/supabase/server.ts',
                   '../src/lib/supabase/client.ts',
                   '../src/lib/auth/storefront.ts']) {
    const src = code(f);
    assert.ok(!/localStorage|sessionStorage/.test(src), `${f}: تخزين متصفّح للجلسة`);
  }
});

test('★★★ أفعال المتجر لا تثق بـstore_id من المتصفّح', () => {
  const src = read('../src/lib/auth/storefront.ts');
  // المتجر يُشتقّ من الـhost عبر resolveStoreByHost في كل فعل
  assert.ok(src.includes('resolveStoreByHost'), 'لا يُحلّ المتجر من الـhost');
  assert.ok(!/formData\.get\(['"`]store_?id/i.test(src), 'store_id يُقرأ من النموذج');
  assert.ok(!/p_store_id\s*:\s*\w*[Ff]orm/.test(src), 'store_id يُمرَّر من النموذج');
});

test('★★★ رابط التأكيد يُبنى من القاعدة لا من ترويسة Host', () => {
  const src = read('../src/lib/auth/storefront.ts');
  // ترويسة Host يتحكّم بها الطالب؛ وضعها في emailRedirectTo يجعل
  // رسالة التأكيد سلاحًا يُوجَّه إلى أي موقع.
  assert.ok(src.includes('store.primaryHost'), 'المضيف لا يُقرأ من القاعدة');
  const redirects = src.match(/(emailRedirectTo|redirectTo)\s*:[^,\n]+/g) ?? [];
  assert.ok(redirects.length >= 2, 'لم يُعثر على وجهات الرسائل');
  for (const r of redirects) {
    assert.ok(r.includes('store.primaryHost'), `وجهة لا تُبنى من القاعدة: ${r}`);
  }
});

test('★★★ التحويل بعد الدخول محميّ من Open Redirect', () => {
  const src = read('../src/lib/auth/storefront.ts');
  assert.ok(src.includes('safeNext('), 'التحويل بلا تنقية');

  // الحمولة المُثبتة سابقًا: TAB يمرّ من فحص ساذج ثم يحذفه المتصفّح
  const attacks = ['/\t/evil.com', '//evil.com', '/\\evil.com',
                   'https://evil.com', '/\n/evil.com', ' //evil.com'];
  for (const a of attacks) {
    const out = safeNext(a, '/');
    assert.equal(out, '/', `مرّت الحمولة: ${JSON.stringify(a)}`);
    const resolved = new URL(out.replace(/[\t\n\r]/g, ''), 'https://store.nilemarket.online');
    assert.equal(resolved.origin, 'https://store.nilemarket.online',
      `خرجت عن نطاق المتجر: ${JSON.stringify(a)}`);
  }
  // والمسار الداخلي المشروع يمرّ
  assert.equal(safeNext('/wishlist', '/'), '/wishlist');
  assert.equal(safeNext('/account', '/'), '/account');
});

test('★★★ عودة OAuth تُستنتج من المضيف لا من معامل', () => {
  const src = read('../src/app/auth/callback/route.ts');
  assert.ok(src.includes('isPlatformHost'), 'الوجهة لا تتبع المضيف');
  assert.ok(src.includes('STORE_NEXT') && src.includes('PLATFORM_NEXT'),
    'قائمة بيضاء واحدة للمضيفين');
  // الوجهة تُبنى من origin الطلب — لا من نطاق يأتي في الرابط
  assert.ok(!/redirect\(\s*`?https?:\/\//.test(src), 'وجهة مطلقة مكتوبة في الكود');
});

test('★★ الـproxy يمرّر /auth ولا يعيد كتابتها إلى مساحة المتجر', () => {
  const src = read('../src/proxy.ts');
  assert.ok(/pathname\s*===\s*'\/auth'\s*\|\|\s*pathname\.startsWith\('\/auth\/'\)/.test(src),
    'مسارات المصادقة تُعاد كتابتها فتعطي 404 على نطاق المتجر');
});

test('★★ Platform Login لم ينكسر: /dashboard و/admin يبقيان محجوبين على المتجر', () => {
  const src = read('../src/proxy.ts');
  assert.ok(src.includes("PLATFORM_ONLY = ['/dashboard', '/admin', '/partner', '/onboarding']"),
    'قائمة مسارات المنصّة تغيّرت');
  // وحجبها يسبق تمرير /auth فلا يفتح الأخير بابًا
  assert.ok(src.indexOf('PLATFORM_ONLY') < src.indexOf("pathname.startsWith('/auth/')"),
    'ترتيب الحجب صار بعد التمرير');
});

test('★★ تحديد المعدل خادميّ ويفشل مغلقًا', () => {
  const src = read('../src/lib/auth/rate-limit.ts');
  assert.ok(src.includes('return false'), 'الفشل لا يُغلق الباب');
  const store = read('../src/lib/auth/storefront.ts');
  for (const b of ['login:', 'signup:', 'reset:']) {
    assert.ok(store.includes(b), `لا تحديد معدّل لـ${b}`);
  }
});

test('★★ لا تعداد حسابات في رسائل الدخول والاستعادة', () => {
  const src = read('../src/lib/auth/storefront.ts');
  assert.ok(src.includes('GENERIC_LOGIN_ERROR'), 'رسالة دخول غير موحّدة');
  assert.ok(/إن كان البريد مسجّلًا/.test(src), 'الاستعادة تكشف وجود البريد');
  assert.ok(/already/.test(src), 'التسجيل يكشف أن البريد مسجّل');
});

test('★★ تعيين كلمة المرور يعتمد الجلسة لا بريدًا مُمرَّرًا', () => {
  const src = read('../src/lib/auth/storefront.ts');
  const fn = src.slice(src.indexOf('storefrontUpdatePassword'));
  assert.ok(fn.includes('getUser()'), 'الهوية لا تُقرأ من الجلسة');
  assert.ok(!/formData\.get\(['"`]email/.test(fn), 'بريد يُقرأ من النموذج');
});
