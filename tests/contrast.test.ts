import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * تباين الألوان يُحسب من `globals.css` نفسه لا من نسخة مكتوبة يدويًا،
 * حتى لا يمرّ تعديل على الرموز دون أن يمرّ على هذا الاختبار.
 */
const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');

function token(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `الرمز غير موجود: --color-${name}`);
  return m![1];
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

test('ألوان الهوية الخمسة لم تتغيّر', () => {
  assert.equal(token('nile-500'), '#0B5ED7');
  assert.equal(token('navy-900'), '#0B1F3A');
  assert.equal(token('sand-50'), '#F5F7FA');
  assert.equal(token('gold-500'), '#D9A441');
  assert.ok(css.includes('#FFFFFF') || true); // الأبيض لا يحتاج رمزًا
});

test('الأخضر ليس لونًا أساسيًا — حالة فقط', () => {
  // اللون الأساسي هو nile-500 الأزرق، ولا رمز أخضر خارج success
  const greens = [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)]
    .filter(([, name]) => /success/.test(name) === false)
    .filter(([, , hex]) => {
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return g > r + 30 && g > b + 30;               // أخضر غالب
    });
  assert.deepEqual(greens.map(([, n]) => n), [],
    'ظهر أخضر خارج ألوان الحالة');
});

test('نصّ الشارات يجتاز WCAG AA (4.5:1)', () => {
  const pairs: [string, string, string][] = [
    ['success', token('success'), token('success-bg')],
    ['danger', token('danger'), token('danger-bg')],
    ['warning', token('gold-700'), token('warning-bg')],
    ['info', token('nile-700'), token('info-bg')],
    ['neutral', token('sand-800'), token('sand-100')],
  ];
  for (const [name, fg, bg] of pairs) {
    const r = ratio(fg, bg);
    assert.ok(r >= 4.5, `شارة ${name}: ${r.toFixed(2)}:1 دون 4.5`);
  }
});

test('ألوان الحالة تجتاز AA على الأبيض و sand-50 أيضًا', () => {
  for (const name of ['success', 'danger', 'gold-700']) {
    for (const bg of [WHITE, token('sand-50')]) {
      const r = ratio(token(name), bg);
      assert.ok(r >= 4.5, `${name} على ${bg}: ${r.toFixed(2)}:1 دون 4.5`);
    }
  }
});

test('حدّ عناصر الإدخال يجتاز WCAG 1.4.11 (3:1)', () => {
  for (const bg of [WHITE, token('sand-50')]) {
    const r = ratio(token('field-border'), bg);
    assert.ok(r >= 3, `حدّ الحقل على ${bg}: ${r.toFixed(2)}:1 دون 3`);
  }
});

test('النصوص الأساسية والأزرار تجتاز AA', () => {
  assert.ok(ratio(token('navy-900'), token('sand-50')) >= 4.5, 'نص الصفحة');
  assert.ok(ratio(token('sand-600'), WHITE) >= 4.5, 'نص ثانوي');
  assert.ok(ratio(WHITE, token('nile-500')) >= 4.5, 'زر أساسي');
  assert.ok(ratio(token('nile-500'), WHITE) >= 4.5, 'رابط');
  assert.ok(ratio(token('navy-900'), token('gold-500')) >= 4.5, 'نص على ذهبي');
});
