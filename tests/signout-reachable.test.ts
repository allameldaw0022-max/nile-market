import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../src', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const files = walk(root);
const read = (p: string) => readFileSync(p, 'utf8');

/**
 * الكود بلا تعليقات.
 *
 * ★ لازم هنا: التعليق الذي يشرح هذا العطل يذكر `signOut()` نصًّا،
 * فالفحص الخام كان يطابق شرح العطل ويمرّ وهو غير موصول — أي حارس
 * يحرس نفسه. تحقّقت من ذلك عمليًا قبل إصلاحه.
 */
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * ★★ إجراء بلا زرّ لا وجود له.
 *
 * `signOut()` كانت معرَّفة في `(auth)/actions.ts` ولا يستدعيها أي
 * مكوّن. فالتاجر يدخل اللوحة ولا يجد مخرجًا: لا في الترويسة ولا في
 * الدرج ولا في الشريط الجانبي. البديل الوحيد كان «الخروج من كل
 * الأجهزة» — وهو يُنهي جلساته على هاتفه وحاسوبه معًا.
 *
 * هذا الاختبار يحرس الوصل لا وجود الدالة.
 */
test('★★ تسجيل الخروج موصول بواجهة يراها المستخدم', () => {
  const callers = files.filter((f) =>
    f.endsWith('.tsx') && /\bsignOut\b/.test(code(f)));

  assert.ok(callers.length > 0,
    '★ لا مكوّن واحد يستدعي signOut — الإجراء معرَّف وغير موصول');
});

test('لوحة التاجر نفسها فيها مخرج — لا صفحة أخرى', () => {
  const layout = read(join(root, 'app/(dashboard)/dashboard/layout.tsx'));
  assert.match(layout, /AccountMenu/, 'قائمة الحساب مركَّبة في ترويسة اللوحة');

  const menu = read(join(root, 'components/shared/AccountMenu.tsx'));
  assert.match(menu, /action=\{signOut\}/, 'الزرّ يستدعي الإجراء فعلًا');
  assert.match(menu, /مركز الأمان/, 'ومعه طريق إلى مركز الأمان');
});

/**
 * ★★ المخرج في **كل** منطقة يقف فيها حساب مسجَّل.
 *
 * الشريك كان يدخل لوحته مباشرة بعد التسجيل ولا يجد فيها أي خروج،
 * والقسم العام كان يعرض زرّ اللوحة وحده لمن سجّل. مخرج في لوحة
 * التاجر لا ينفع من لم يصل إليها قط.
 */
test('★★ ومنطقة الشريك والقسم العام كذلك', () => {
  const partner = read(join(root, 'app/(partner)/partner/layout.tsx'));
  assert.match(partner, /AccountMenu/, 'ترويسة الشريك فيها قائمة الحساب');

  const platform = read(join(root, 'app/(platform)/layout.tsx'));
  assert.match(platform, /AccountMenu/, 'والقسم العام كذلك');
});

test('★★ والمخرج يظهر على الهاتف لا على الشاشات الواسعة وحدها', () => {
  // القائمة الواسعة مخفيّة على الهاتف، فلولا هذا لبقي المستخدم
  // على شاشة ضيّقة بلا أي طريق للخروج.
  const nav = code(join(root, 'components/marketing/MobileNav.tsx'));
  assert.match(nav, /action=\{signOut\}/, 'القائمة الضيّقة فيها زرّ خروج');
});

/**
 * ★★★ العطل الذي أوقع «تعذّر إتمام العملية» بعد التسجيل كشريك.
 *
 * `cookies().delete()` كانت تُنادى أثناء تصيير `/partners/join`،
 * وNext يرمي `ReadonlyRequestCookiesError` (E1180): الكوكيز لا
 * تُعدَّل إلا في Server Action أو Route Handler. النتيجة أنّ ملف
 * الشريك يُنشأ فعلًا ثم ينهار العرض بعده — فيرى المسجِّل صفحة خطأ
 * ويظنّ أن التسجيل فشل.
 *
 * الحارس يمنع عودة الصنف كلّه: لا كتابة كوكي من ملف يُصيَّر.
 */
test('★★★ لا تُكتب كوكي أثناء تصيير صفحة أو تخطيط (E1180)', () => {
  const rendered = files.filter((f) =>
    /\/(page|layout|template|not-found|error)\.tsx$/.test(f));
  assert.ok(rendered.length > 20, 'الفحص يرى صفحات المشروع فعلًا');

  const MUTATORS = /\b(setPartnerIntent|clearPartnerIntent|ensureCartToken|setLastOrder|clearCartToken)\b/;

  for (const f of rendered) {
    const body = code(f);
    assert.doesNotMatch(body, MUTATORS,
      `${f.replace(root, 'src')}: كتابة كوكي في ملف يُصيَّر ⇒ E1180`);
    assert.doesNotMatch(body, /cookies\(\)[\s\S]{0,40}?\.(set|delete)\(/,
      `${f.replace(root, 'src')}: cookies().set/delete أثناء التصيير ⇒ E1180`);
  }
});

test('الخروج من جهاز واحد ≠ الخروج من كل الأجهزة', () => {
  const actions = read(join(root, 'app/(platform)/(auth)/actions.ts'));
  assert.match(actions, /signOut\(\)[\s\S]*?auth\.signOut\(\);/,
    'signOut بلا scope ⇒ هذا الجهاز وحده');
  assert.match(actions, /signOut\(\{ scope: 'global' \}\)/,
    'والعالمي يبقى منفصلًا في مركز الأمان');
});

/**
 * ★★★ إجراء بلا زرّ لا وجود له — نفس الصنف، حالة أخرى.
 *
 * `publishStore()` كانت تعيش في معالج الإنشاء وحده. من غادره قبل
 * خطوته الأخيرة يبقى متجره `draft` إلى الأبد: لا زرّ نشر في اللوحة،
 * ورابط متجره يعطي «الصفحة غير موجودة» بلا سبب. خمسة من سبعة
 * متاجر على الإنتاج كانت كذلك.
 */
test('★★★ النشر موصول باللوحة لا بمعالج الإنشاء وحده', () => {
  const dashboard = code(join(root, 'app/(dashboard)/dashboard/page.tsx'));
  assert.match(dashboard, /PublishBanner/,
    'لوحة التاجر تعرض دعوة النشر حين يكون المتجر مسوّدة');

  const banner = code(join(root, 'components/dashboard/PublishBanner.tsx'));
  assert.match(banner, /publishStore\(/, 'والزرّ يستدعي الإجراء فعلًا');
});

/**
 * ★★ متجر قائم غير منشور ليس صفحة غير موجودة.
 *
 * `notFound()` على حالة `draft` كان يُظهر 404 عامًّا لصاحب المتجر
 * نفسه، فلا يعرف أن السبب أنّه لم ينشره.
 */
test('★★ ومتجر غير منشور يُفسَّر لصاحبه لا يُرمى في 404', () => {
  const layout = code(join(root, 'app/(storefront)/sites/[host]/layout.tsx'));

  // الحالات الثلاث غير النشطة تُعالَج بإشعار، ولا يبقى `notFound`
  // إلا لمضيف لا متجر له أصلًا.
  assert.match(layout, /status === 'suspended'[\s\S]{0,120}StoreNotice/);
  assert.match(layout, /status !== 'active'[\s\S]{0,200}StoreNotice/,
    'غير النشط يُعرض بإشعار لا بـ404');
  assert.doesNotMatch(layout, /status !== 'active'\)\s*notFound\(\)/,
    '★ لا عودة إلى 404 الصامت على متجر قائم');
});
