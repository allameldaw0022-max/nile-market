import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * ═══════════════════════════════════════════════════════════════════
 * كل دالّة يناديها الكود موجودةٌ في `public` وممنوحةٌ لدور.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ★★★ العطل الذي يحرسه: `saveCoupon` كانت تنادي `assert_within_limit`،
 * وهي تعيش في سكيمة `app` التي لا يكشفها PostgREST. فالطلب يُردّ قبل
 * أن يلمس القاعدة بـ«لا دالّة بهذا الاسم»، وتترجمه `fromPostgres` إلى
 * «حدث خطأ غير متوقع». النتيجة: **لم يُنشأ كود خصم واحد في المنصّة
 * منذ إطلاقها** — ولا سطر في سجلّ القاعدة يدلّ على السبب، لأن الطلب
 * لم يصلها أصلًا.
 *
 * ★★ ولا يكشفه بناءٌ ولا تحقّق أنواع: اسم الدالّة نصٌّ حرفيّ، وأي خطأ
 * فيه — سكيمة خاطئة، حرفٌ ناقص، دالّة لم تُنشأ هجرتها بعد — يمرّ إلى
 * الإنتاج صامتًا ويظهر عند أول تاجر يضغط «حفظ».
 *
 * القراءة من الهجرات لا من قاعدةٍ حيّة عمدًا: الهجرات مصدر الحقيقة،
 * والاختبار يعمل بلا شبكة وبلا قاعدة.
 */

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');

/** كل ملفات المصدر — بلا تعليقات، فاسم دالّة في شرحٍ ليس نداءً. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true })) {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) sourceFiles(`${path}/`, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const stripComments = (code: string) => code
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

// `rpc(supabase, 'name'` من المساعد، و`.rpc('name'` من العميل مباشرة.
const CALL_RE = /(?:\brpc\(\s*[A-Za-z_$][\w$]*\s*,|\.rpc\()\s*'([a-z_0-9]+)'/g;

function calledFunctions(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles('src/')) {
    const code = stripComments(read(file));
    for (const m of code.matchAll(CALL_RE)) {
      const list = found.get(m[1]) ?? [];
      if (!list.includes(file)) list.push(file);
      found.set(m[1], list);
    }
  }
  return found;
}

const migrations = readdirSync(new URL('supabase/migrations/', root))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => read(`supabase/migrations/${f}`))
  .join('\n');

const defined = new Set(
  [...migrations.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\(/gi,
  )].map((m) => m[1].toLowerCase()),
);

/** اسم الدالّة ⟶ الأدوار الممنوحة تنفيذها. */
const granted = new Map<string, Set<string>>();
for (const m of migrations.matchAll(
  /grant\s+execute\s+on\s+function\s+public\.([a-z_0-9]+)\s*\([^)]*\)\s*(?:\n\s*)?to\s+([^;]+);/gi,
)) {
  const name = m[1].toLowerCase();
  const roles = granted.get(name) ?? new Set<string>();
  for (const role of m[2].split(',')) roles.add(role.trim().toLowerCase());
  granted.set(name, roles);
}

const called = calledFunctions();

test('الحارس يرى الشيفرة فعلًا — وإلا فهو يحرس الفراغ', () => {
  assert.ok(called.size >= 50,
    `لم يُعثر إلا على ${called.size} نداء — المطابِق انكسر، لا الشيفرة نظفت`);
  assert.ok(defined.size >= 50,
    `لم تُقرأ إلا ${defined.size} دالّة من الهجرات`);
  assert.ok(called.has('save_product'), 'نداءٌ معروف مفقود — المطابِق لا يرى المساعد');
  assert.ok(called.has('save_coupon'), 'نداءٌ معروف مفقود');
});

test('★★★ كل دالّة يناديها الكود مُعرَّفة في سكيمة public', () => {
  const missing = [...called.entries()]
    .filter(([name]) => !defined.has(name))
    .map(([name, files]) => `${name}  ← ${files.join(', ')}`);

  assert.deepEqual(missing, [],
    'دالّة تُنادى ولا توجد في `public`: PostgREST يردّ الطلب قبل القاعدة، ' +
    'فيرى المستخدم «حدث خطأ غير متوقع» ولا يظهر في سجلّ القاعدة شيء.\n' +
    missing.join('\n'));
});

test('★★ ولها منحة تنفيذٍ صريحة لدور', () => {
  const ungranted = [...called.keys()]
    .filter((name) => defined.has(name) && !granted.has(name));

  assert.deepEqual(ungranted, [],
    'دالّة معرَّفة بلا `grant execute`: كل نداء لها يُردّ بـ«permission denied» — ' +
    'وهو خطأٌ تبتلعه بعض المسارات فتبدو الصفحة سليمة وهي لا تعمل.\n' +
    ungranted.join('\n'));
});

test('★ وحدّ الباقة لا يُفحص بنداءٍ منفصل من الخادم', () => {
  // الفحص داخل دالّة الكتابة نفسها أو لا يكون: نداءٌ منفصل يسبق الكتابة
  // قابلٌ للتخطّي بطلبٍ مباشر إلى PostgREST، فيصير الحدّ سياجًا لا جدارًا.
  for (const file of sourceFiles('src/')) {
    const code = stripComments(read(file));
    assert.ok(!/assert_within_limit/.test(code),
      `${file}: حدّ الباقة يُفحص بنداء منفصل — ضعه داخل دالّة الكتابة في القاعدة`);
  }
});
