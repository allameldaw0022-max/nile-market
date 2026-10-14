import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * ═══════════════════════════════════════════════════════════════════
 * القسم التعريفيّ يبقى قابلًا للتخزين على الحافّة.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ★★★ العطل: `getActor()` واحدة في تخطيط القسم — لتقرّر إن كان الزائر
 * مسجَّلًا — كانت تقرأ الكوكيز، فيُصيّر Next **كل** صفحات القسم لكل
 * طلب: سبع عشرة صفحة، منها الرئيسية والباقات. والرئيسية تعلن
 * `revalidate = 300` فيبدو أنها مخزَّنة، والتخزين مُبطَل من فوقها.
 *
 * ★★ وثانيةٌ أخفى: الرئيسية والباقات كانتا تجلبان قائمة الباقات —
 * وهي بيانات عامّة — بعميل **الجلسة**، وهو يقرأ الكوكيز كذلك. فحتى
 * بعد إصلاح التخطيط تبقى الصفحة ديناميكية.
 *
 * ★ القياس قبل الإصلاح: `x-vercel-cache: MISS` في كل طلب وTTFB
 *   ~٥٧٥ م.ث للرئيسية — وهي أول ما يراه الزائر الجديد.
 */

const LAYOUT = code('../src/app/(platform)/layout.tsx');

test('★★★ تخطيط القسم التعريفيّ لا يقرأ هويّة الزائر', () => {
  assert.ok(!/getActor|cookies\(\)|headers\(\)/.test(LAYOUT),
    'قراءةُ هويّةٍ في التخطيط تُحوّل ١٧ صفحة تعريفية إلى تصيير لكل طلب. '
    + 'الشخصيّ يُجلب بعد الإماهة في `HeaderAccount`.');
});

test('★★ والقراءات العامّة بعميل بلا كوكيز', () => {
  for (const page of ['page.tsx', 'pricing/page.tsx', 'legal/[slug]/page.tsx']) {
    const src = code(`../src/app/(platform)/${page}`);
    assert.ok(!/from '@\/lib\/supabase\/server'/.test(src),
      `${page}: عميل الجلسة يقرأ الكوكيز فيُفقد تخزين الصفحة — `
      + 'استعمل `createPublicClient` للقراءات العامّة');
  }
});

test('★ والرئيسية تُعلن مدّة إعادة التحقّق — وإلا فلا تخزين', () => {
  assert.match(code('../src/app/(platform)/page.tsx'), /export const revalidate\s*=\s*\d+/,
    'بلا `revalidate` لا تُخزَّن الصفحة على الحافّة');
});
