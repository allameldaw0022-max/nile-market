import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * التباين يُحسب من `globals.css` نفسه لا من نسخة مكتوبة يدويًا، حتى
 * لا يمرّ تعديل على الرموز دون أن يمرّ على هذا الاختبار.
 */
const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

function token(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `الرمز غير موجود: --color-${name}`);
  return m![1].toUpperCase();
}

const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a: string, b: string) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const WHITE = '#FFFFFF';

test('ألوان الهوية المعتمدة موجودة بقيمها الحرفية', () => {
  assert.equal(token('teal-500'), '#00A88F', 'Primary Teal');
  assert.equal(token('ink-800'),  '#17191C', 'Charcoal');
  assert.equal(token('ink-50'),   '#F7F8F9', 'Soft Gray');
  assert.equal(token('ink-900'),  '#111315', 'Primary text');
  assert.equal(token('ink-500'),  '#667085', 'Secondary text');
  assert.equal(token('ink-200'),  '#E5E7EB', 'Border');
  assert.equal(token('gold-500'), '#C9A24A', 'Premium Gold');
  assert.equal(token('danger'),   '#D92D20', 'Error');
  assert.equal(token('success-solid'), '#12B76A', 'Success');
});

test('★ لا أزرق ولا نيفي ولا بنفسجي ولا وردي ولا برتقالي كألوان هوية', () => {
  const banned = ['#0B5ED7', '#0B1F3A'];
  for (const hex of banned) {
    assert.ok(!css.toUpperCase().includes(hex), `لون ممنوع في الرموز: ${hex}`);
  }
  // فحص بنيوي: لا رمز لونه أزرق/بنفسجي/وردي غالب
  const offenders = [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)]
    .filter(([, , hex]) => {
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      const blue = b > r + 40 && b > g + 25;          // أزرق/نيفي
      const purple = r > g + 40 && b > g + 40;        // بنفسجي/وردي
      return blue || purple;
    });
  assert.deepEqual(offenders.map(([, n]) => n), [], 'ظهر لون أزرق أو بنفسجي في الرموز');
});

test('★ زرّ CTA الأساسي يجتاز AA — وهو ما تسقط فيه اللوحة الخام', () => {
  // الأبيض على ‎#00A88F يعطي 3.00:1 — لذلك السطح التفاعلي teal-600
  assert.ok(ratio(WHITE, token('teal-500')) < 4.5,
    'إن صار ‎#00A88F يجتاز AA فراجع هذا الاختبار');
  assert.ok(ratio(WHITE, token('teal-600')) >= 4.5,
    `زرّ CTA: ${ratio(WHITE, token('teal-600')).toFixed(2)}:1`);
});

test('النصوص والروابط تجتاز AA على الأبيض وعلى خلفية الصفحة', () => {
  const soft = token('ink-50');
  const pairs: [string, string][] = [
    ['ink-900', 'نصّ أساسي'], ['ink-500', 'نصّ ثانوي'],
    ['teal-700', 'رابط'], ['gold-700', 'نصّ ذهبي'],
    ['success', 'نصّ نجاح'], ['danger', 'نصّ خطأ'],
  ];
  for (const [name, label] of pairs) {
    for (const bg of [WHITE, soft]) {
      const r = ratio(token(name), bg);
      assert.ok(r >= 4.5, `${label} (${name}) على ${bg}: ${r.toFixed(2)}:1`);
    }
  }
});

test('نصّ الشارات والتنبيهات على خلفياتها الملوّنة يجتاز AA', () => {
  const pairs: [string, string, string][] = [
    ['نجاح',  'success',  'success-bg'],
    ['خطأ',   'danger',   'danger-bg'],
    ['تحذير', 'gold-700', 'warning-bg'],
    ['معلومة','teal-700', 'teal-50'],
  ];
  for (const [label, fg, bg] of pairs) {
    const r = ratio(token(fg), token(bg));
    assert.ok(r >= 4.5, `${label}: ${r.toFixed(2)}:1`);
  }
});

test('الأسطح الداكنة والذهبية تحمل نصًّا مقروءًا', () => {
  assert.ok(ratio(WHITE, token('ink-800')) >= 4.5, 'أبيض على شاركول');
  assert.ok(ratio(WHITE, token('ink-900')) >= 4.5, 'أبيض على الأغمق');
  // الذهبي سطحًا يحمل شاركول لا أبيض (الأبيض عليه 2.40:1)
  assert.ok(ratio(token('ink-900'), token('gold-500')) >= 4.5, 'شاركول على ذهبي');
  assert.ok(ratio(WHITE, token('gold-500')) < 4.5,
    'لو صار الأبيض يجتاز على الذهبي فراجع زرّ gold');
});

test('حدّ عناصر التحكّم يجتاز WCAG 1.4.11 (3:1)', () => {
  for (const bg of [WHITE, token('ink-50')]) {
    const r = ratio(token('ink-400'), bg);
    assert.ok(r >= 3, `حدّ الحقل على ${bg}: ${r.toFixed(2)}:1`);
  }
  // الحدّ الزخرفي (ink-200) معفى من 1.4.11 لأنه لا يُعرّف عنصر تحكّم
});

test('حلقة التركيز تجتاز 3:1 على الخلفيات الفاتحة', () => {
  for (const bg of [WHITE, token('ink-50')]) {
    assert.ok(ratio(token('teal-600'), bg) >= 3, `حلقة التركيز على ${bg}`);
  }
});

test('الخطّ هو IBM Plex Sans Arabic', () => {
  assert.match(css, /--font-sans:\s*var\(--font-plex-arabic\)/);
});

/**
 * ★ قوالب البريد لا تستطيع استعمال متغيّرات CSS — عملاء البريد لا
 * يدعمونها — فتُكتب الألوان فيها hex حرفيًا. وهذا بالضبط ما يجعلها
 * تُنسى عند تغيير الهوية: لا يشدّها رمز مشترك. فتُفحص هنا.
 */
test('قوالب البريد وملفّات PWA بالهوية الجديدة لا القديمة', () => {
  const files = [
    '../src/lib/email/templates.ts',
    '../src/app/manifest.ts',
    '../src/app/(storefront)/sites/[host]/manifest.webmanifest/route.ts',
  ];
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8').toUpperCase();
    for (const banned of ['#0B5ED7', '#0B1F3A', '#F5F7FA']) {
      assert.ok(!src.includes(banned), `${f} ما زال يحمل ${banned}`);
    }
  }
});

test('ألوان البريد الحرفية تجتاز AA', () => {
  // الأبيض على زرّ البريد، والرابط على أبيض، والأبيض على الترويسة
  assert.ok(ratio(WHITE, '#008672') >= 4.5, 'زرّ البريد');
  assert.ok(ratio('#008672', WHITE) >= 4.5, 'رابط البريد');
  assert.ok(ratio(WHITE, '#17191C') >= 4.5, 'ترويسة البريد');
});

/* =====================================================================
   القالب الرقمي — تباين الوضعين
   ---------------------------------------------------------------------
   ★★ التقرير السابق أقرّ بأنّ التباين لم يُقَس للرموز الجديدة. يُقاس
   هنا من `globals.css` نفسه، فلا يمرّ تعديلٌ على رمزٍ داكن دون أن
   يمرّ على هذا الاختبار.

   ★ والرموز الداكنة معرَّفة مرّتين (تفضيل النظام + الطلب الصريح)
   بقيمٍ متطابقة؛ الاختبار يقرأ الكتلة الصريحة
   (`[data-nm-digital][data-nm-theme="dark"]`) ويتحقّق أنّ الأخرى
   تطابقها — فلو انحرفت إحداهما ظهر ذلك.
   ===================================================================== */

/**
 * يقرأ رمزًا من كتلة CSS محدَّدة بمُحدِّدها.
 * ★ يتحمّل الاسم بـ`--` أو بدونها: تمريرها مرّتين كان يبني
 *   `----d-text` فيفشل البحث — خطأٌ في الأداة يُظهر سقوطًا وهميًّا.
 */
function scoped(selector: string, name: string): string {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `المُحدِّد غير موجود: ${selector}`);
  const block = css.slice(at, css.indexOf('}', at));
  const bare = name.replace(/^--/, '');
  const m = block.match(new RegExp(`--${bare}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `${bare} غير معرَّف في ${selector}`);
  return m![1].toUpperCase();
}

const LIGHT = (n: string) => scoped('[data-nm-digital] {', n);
const DARK  = (n: string) => scoped('[data-nm-digital][data-nm-theme="dark"] {', n);

test('★★★ القالب الرقمي — وضع النهار يجتاز AA لكل زوج مستعمل', () => {
  const pairs: [string, string, string, number][] = [
    // [نصّ, خلفية, وصف, الحدّ]
    ['--d-text',     '--d-bg',        'النصّ الأساسي على الصفحة',   4.5],
    ['--d-text',     '--d-surface',   'النصّ على البطاقة',          4.5],
    ['--d-text',     '--d-surface-2', 'النصّ على السطح الثاني',     4.5],
    ['--d-text-2',   '--d-surface',   'النصّ الثانوي على البطاقة',  4.5],
    ['--d-text-2',   '--d-bg',        'النصّ الثانوي على الصفحة',   4.5],
    ['--d-accent',   '--d-surface',   'السعر والرابط على البطاقة',  4.5],
    ['--d-accent',   '--d-bg',        'الرابط على الصفحة',          4.5],
    ['--d-accent',   '--d-accent-weak', 'نصّ على سطح التيل الخفيف', 4.5],
    ['--d-danger',   '--d-surface',   'نصّ الخطأ',                  4.5],
    ['--d-success',  '--d-surface',   'نصّ النجاح',                 4.5],
    ['--d-on-accent','--d-accent-surface', 'نصّ زرّ CTA',           4.5],
    ['--d-invert-text', '--d-invert-bg', 'النصّ على القسم الداكن',  4.5],
    // حدود عناصر التحكّم: ٣:١ يكفي (WCAG 1.4.11 لغير النصّ) — ويُقاس
    // على **كلا** السطحين لأنّ الحقول تظهر على البطاقة وعلى الصفحة.
    ['--d-border-strong', '--d-surface', 'حدّ عنصر تحكّم على البطاقة', 3.0],
    ['--d-border-strong', '--d-bg',      'حدّ عنصر تحكّم على الصفحة',  3.0],
  ];
  const fails: string[] = [];
  for (const [fg, bg, label, min] of pairs) {
    const r = ratio(LIGHT(fg), LIGHT(bg));
    if (r < min) fails.push(`${label}: ${LIGHT(fg)} على ${LIGHT(bg)} = ${r.toFixed(2)}:1 (الحدّ ${min})`);
  }
  assert.deepEqual(fails, [], 'أزواج نهار تسقط دون الحدّ');
});

test('★★★ القالب الرقمي — وضع الليل يجتاز AA لكل زوج مستعمل', () => {
  const pairs: [string, string, string, number][] = [
    ['--d-text',     '--d-bg',        'النصّ الأساسي',              4.5],
    ['--d-text',     '--d-surface',   'النصّ على البطاقة',          4.5],
    ['--d-text',     '--d-surface-2', 'النصّ على السطح الثاني',     4.5],
    ['--d-text-2',   '--d-surface',   'النصّ الثانوي على البطاقة',  4.5],
    ['--d-text-2',   '--d-bg',        'النصّ الثانوي على الصفحة',   4.5],
    ['--d-accent',   '--d-surface',   'السعر والرابط على البطاقة',  4.5],
    ['--d-accent',   '--d-bg',        'الرابط على الصفحة',          4.5],
    ['--d-accent',   '--d-accent-weak', 'نصّ على سطح التيل الخفيف', 4.5],
    ['--d-danger',   '--d-surface',   'نصّ الخطأ',                  4.5],
    ['--d-success',  '--d-surface',   'نصّ النجاح',                 4.5],
    ['--d-on-accent','--d-accent-surface', 'نصّ زرّ CTA',           4.5],
    ['--d-invert-text', '--d-invert-bg', 'النصّ على القسم الداكن',  4.5],
    ['--d-border-strong', '--d-surface', 'حدّ عنصر تحكّم على البطاقة', 3.0],
    ['--d-border-strong', '--d-bg',      'حدّ عنصر تحكّم على الصفحة',  3.0],
  ];
  const fails: string[] = [];
  for (const [fg, bg, label, min] of pairs) {
    const r = ratio(DARK(fg), DARK(bg));
    if (r < min) fails.push(`${label}: ${DARK(fg)} على ${DARK(bg)} = ${r.toFixed(2)}:1 (الحدّ ${min})`);
  }
  assert.deepEqual(fails, [], 'أزواج ليل تسقط دون الحدّ');
});

test('★★ كتلتا الليل متطابقتان (تفضيل النظام = الطلب الصريح)', () => {
  const media = css.slice(css.indexOf('[data-nm-digital]:not([data-nm-theme="light"])'));
  const mediaBlock = media.slice(0, media.indexOf('}'));
  const names = [...mediaBlock.matchAll(/--(d-[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)];
  assert.ok(names.length >= 15, 'كتلة تفضيل النظام ناقصة');
  const diffs: string[] = [];
  for (const [, n, hex] of names) {
    if (hex.toUpperCase() !== DARK(n)) diffs.push(`${n}: ${hex} ≠ ${DARK(n)}`);
  }
  assert.deepEqual(diffs, [], 'كتلتا الليل انحرفتا — زائرٌ يرى ثيمًا مختلفًا بحسب طريق التطبيق');
});

test('★★★ الحدّ الزخرفي مرئي في الوضعين (١.٥:١ على الأقل)', () => {
  // WCAG لا يفرض حدًّا للزخرفي، لكن حدًّا لا يُرى أصلًا يفقد وظيفته:
  // بطاقات متلاصقة بلا فاصل مرئي. القياس يمنع رمزًا «موجودًا ولا يُرى».
  for (const [mode, T] of [['نهار', LIGHT], ['ليل', DARK]] as const) {
    const r = ratio(T('--d-border'), T('--d-surface'));
    assert.ok(r >= 1.15, `${mode}: الحدّ ${T('--d-border')} على ${T('--d-surface')} = ${r.toFixed(2)}:1`);
  }
});

test('★★★ رموز القالب الرقمي لا تُعرَّف على :root ولا html/body', () => {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // كل تعريف لرمز `--d-` يجب أن يكون داخل كتلة محدِّدها يحمل
  // `[data-nm-digital]` — وإلا تسرّب إلى لوحة التحكّم والإدارة.
  const leaks: string[] = [];
  const blocks = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const [, sel, body] of blocks) {
    if (!/--d-[a-z0-9-]+:/.test(body)) continue;
    if (!sel.includes('[data-nm-digital]')) leaks.push(sel.trim().slice(0, 80));
  }
  assert.deepEqual(leaks, [], 'رموز رقمية معرَّفة خارج شجرة القالب الرقمي');
});

test('★★★ لا رمز نصّ ثالث في القالب الرقمي', () => {
  // ★ جُرِّب ورُفض: `--d-text-3` كان ‎#8F9093 ⇒ ٣.١٩:١ على أبيض — دون
  // AA للنصّ العادي. واللوحة لا تحتمل ثلاث درجات نصّ تجتاز ٤.٥:١ على
  // أبيض، فالنظام درجتان: أساسي وثانوي. وهذا الحارس يمنع عودة الثالثة.
  assert.ok(!/--d-text-3/.test(css), 'عاد رمز نصّ ثالث دون AA');
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/var\(--d-text-3\)/.test(clean), 'استعمالٌ لرمز محذوف');
});

/**
 * ★★★ حارس بنيويّ: السطح الثاني يحمل النصّ الأساسي وحده.
 *
 * ثغرةٌ في المواصفة لا في اللوحة: قائمة الأزواج أعلاه لم تجمع
 * `--d-text-2` ولا `--d-danger` مع `--d-surface-2`، فمرّ زوجان دون AA
 * (٤.٣٩:١ و٤.٢٧:١) حتى قاسهما axe على ٨٧ عقدة. فبعد إصلاحهما يُحرَس
 * المنعُ بنيويًّا: أيّ زوج جديد على السطح الثاني يجب أن يُقاس أو يُمنع.
 */
test('★★★ لا نصّ ثانوي ولا أحمر على السطح الثاني (دون AA في النهار)', () => {
  const files = [
    'DigitalProductView', 'DigitalProductCard', 'DigitalBuyPanel',
    'DigitalChrome', 'CategoryTiles', 'ThemeToggle',
  ];
  const bad: string[] = [];
  for (const f of files) {
    const src = readFileSync(
      new URL(`../src/components/storefront/digital/${f}.tsx`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // كل كائن نمط يجمع السطح الثاني مع لون نصّ
    for (const m of src.matchAll(/var\(--d-surface-2\)[^}]{0,160}/g)) {
      const chunk = m[0];
      for (const t of ['--d-text-2', '--d-danger', '--d-success']) {
        if (chunk.includes(`var(${t})`)) bad.push(`${f}: ${t} على السطح الثاني`);
      }
    }
  }
  assert.deepEqual([...new Set(bad)], [], 'زوجٌ دون AA على السطح الثاني');
});

test('★★★ وكل زوج قياس يشمل السطح الثاني صراحةً', () => {
  // يمنع عودة الثغرة نفسها: المواصفة يجب أن تقيس السطح الثاني.
  const spec = readFileSync(new URL('./contrast.test.ts', import.meta.url), 'utf8');
  assert.ok(spec.includes("'--d-text',     '--d-surface-2'"),
    'قائمة الأزواج لا تقيس النصّ على السطح الثاني');
});
