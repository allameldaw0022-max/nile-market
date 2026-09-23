import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** الكود بلا تعليقات: التعليقات هنا تشرح العطل فتذكر الصيغة الخاطئة. */
function code(p: string): string {
  return read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * حارس ضد قفل مالك المنصّة خارج لوحته.
 *
 * ثلاث حقائق مجتمعة تصنع القفل:
 *   • `admin_members.mfa_required` افتراضها `true` في القاعدة.
 *   • الحارس يرفض `/admin` ما لم تكن الجلسة `aal2`.
 *   • `disableMfa` يرفض إلغاء التحقق عن حساب إدارة.
 * فإن تعذّر بلوغ `aal2` فلا مخرج من داخل المنتج.
 */

test('★★ مستوى التوثيق لا يُقرأ من كائن المستخدم — لا يحمله أصلًا', () => {
  const src = code('../src/lib/auth/actor.ts');

  assert.ok(
    !/\buser\s*(as[^)]*)?\)?\s*\.\s*aal\b/.test(src) && !/\{\s*aal\?:/.test(src),
    'قراءة `user.aal` تعطي undefined دائمًا ⇒ aal1 دائمًا ⇒ قفل تامّ',
  );
  assert.match(
    src, /getAuthenticatorAssuranceLevel\(\)/,
    'المصدر الصحيح هو مطالبة `aal` عبر getAuthenticatorAssuranceLevel()',
  );
  assert.match(
    src, /currentLevel === 'aal2' \? 'aal2' : 'aal1'/,
    'يفشل مغلقًا: أي خطأ أو غياب يُعامَل كـaal1',
  );
});

test('★★ يوجد في المنتج مكان يرفع جلسة aal1 إلى aal2', () => {
  const action = code('../src/app/(platform)/(auth)/actions.ts');
  assert.match(action, /export async function verifyMfaChallenge/,
    'إجراء رفع الجلسة موجود');

  const ui = code('../src/app/(platform)/account/security/MfaSection.tsx');
  assert.match(ui, /verifyMfaChallenge/,
    '★ الإجراء كان معرَّفًا وغير مستعمَل في أي ملف — أي أن المخرج غير موصول');
  assert.match(ui, /currentAal !== 'aal2'/,
    'النموذج يظهر حين تكون الجلسة أدنى من aal2');

  const page = code('../src/app/(platform)/account/security/page.tsx');
  assert.match(page, /currentAal=\{actor\.aal\}/,
    'الصفحة تمرّر مستوى الجلسة الفعلي');
});

test('حارس اللوحة يردّ إلى مركز الأمان لا إلى طريق مسدود', () => {
  const layout = code('../src/app/(admin)/admin/layout.tsx');
  assert.match(layout, /aal !== 'aal2'/, 'الحارس قائم');
  assert.match(layout, /redirect\('\/account\/security/,
    'الردّ إلى الصفحة التي تحمل نموذج الرفع');
});
