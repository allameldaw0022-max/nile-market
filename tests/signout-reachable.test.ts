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

  const menu = read(join(root, 'components/dashboard/AccountMenu.tsx'));
  assert.match(menu, /action=\{signOut\}/, 'الزرّ يستدعي الإجراء فعلًا');
  assert.match(menu, /مركز الأمان/, 'ومعه طريق إلى مركز الأمان');
});

test('الخروج من جهاز واحد ≠ الخروج من كل الأجهزة', () => {
  const actions = read(join(root, 'app/(platform)/(auth)/actions.ts'));
  assert.match(actions, /signOut\(\)[\s\S]*?auth\.signOut\(\);/,
    'signOut بلا scope ⇒ هذا الجهاز وحده');
  assert.match(actions, /signOut\(\{ scope: 'global' \}\)/,
    'والعالمي يبقى منفصلًا في مركز الأمان');
});
