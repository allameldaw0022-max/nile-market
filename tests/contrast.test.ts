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
