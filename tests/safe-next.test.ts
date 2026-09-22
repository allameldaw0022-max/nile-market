import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext, DEFAULT_NEXT } from '../src/lib/safe-next.ts';

/**
 * ما يفهمه المتصفّح لا ما نرسله: WHATWG URL يحذف TAB و LF و CR من
 * الرابط قبل تحليله. فالفحص الصادق هو تحليل الناتج بعد الحذف.
 */
function browserResolves(path: string): string {
  const stripped = path.replace(/[\t\n\r]/g, '');
  return new URL(stripped, 'https://nilemarket.app').origin;
}

const ATTACKS = [
  '/\t/evil.com',          // ★ الثغرة المُثبتة: TAB يمرّ ثم يحذفه المتصفّح
  '/\n/evil.com',
  '/\r/evil.com',
  '/\t\t//evil.com',
  '//evil.com',
  '/\\evil.com',
  '\\\\evil.com',
  'https://evil.com',
  'http://evil.com',
  '//evil.com/dashboard',
  ' //evil.com',
  '/\u0000/evil.com',
  'javascript:alert(1)',
  '/%09/evil.com'.replace('%09', '\t'),
];

test('لا حمولة تخرج من النطاق — لا قبل حذف المتصفّح ولا بعده', () => {
  for (const attack of ATTACKS) {
    const out = safeNext(attack);
    assert.equal(out, DEFAULT_NEXT, `مرّت الحمولة: ${JSON.stringify(attack)}`);
    assert.equal(browserResolves(out), 'https://nilemarket.app',
                 `خرجت عن النطاق بعد حذف المتصفّح: ${JSON.stringify(attack)}`);
  }
});

test('المسارات الداخلية المشروعة تمرّ كما هي', () => {
  for (const ok of ['/dashboard', '/dashboard/orders', '/account/security',
                    '/dashboard/products?page=2', '/sites/x/products#top',
                    '/dashboard/orders/3f0a-11', '/%D9%85%D8%AA%D8%AC%D8%B1']) {
    assert.equal(safeNext(ok), ok, `رُفض مسار مشروع: ${ok}`);
  }
});

test('المدخل الفارغ أو غير النصّي يعيد الوجهة الافتراضية', () => {
  for (const bad of ['', null, undefined, 42, {}, []]) {
    assert.equal(safeNext(bad), DEFAULT_NEXT);
  }
});

test('وجهة افتراضية مخصّصة تُحترم', () => {
  assert.equal(safeNext('//evil.com', '/partner'), '/partner');
});

test('المسار المفرط الطول يُرفض', () => {
  assert.equal(safeNext('/' + 'a'.repeat(600)), DEFAULT_NEXT);
});
