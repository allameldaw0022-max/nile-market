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
 * الضغطة المبتلَعة: زرٌّ يُعطَّل بين `mousedown` و`click`.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ★★★ العطل: في «أنشئ متجرك» كان `onBlur` لحقل الرابط يبدأ فحصًا في
 * **نفس** `useTransition` الذي يغذّي `loading` زرّ الإرسال. و`Button`
 * يعطّل نفسه عند `loading` (`disabled = disabled || loading`). فمن
 * يكتب الرابط ثم يضغط الزرّ مباشرة — وهو التدفّق الطبيعي — يخرج
 * التركيز عند `mousedown` فيبدأ الفحص، فيُعطَّل الزرّ قبل أن يصل
 * `click`، فلا يُرسَل النموذج. ثم يعود الزرّ كما كان: **لا متجر، ولا
 * رسالة، ولا خطأ في أي سجلّ**.
 *
 * ★★ وهو أوّل زرّ في المنصّة كلّها. ويتّسع أثره كلّما بطُؤت الشبكة.
 *
 * ★ مُثبَت بالتجربة على الإنتاج: ضغطةٌ والتركيز في حقل الرابط ⇒ طلبٌ
 *   واحد فقط هو فحص الرابط ولا متجر. وبعد إخراج التركيز أوّلًا ⇒
 *   النموذج يُرسَل والمتجر يُنشأ.
 */

const WIZARD = code('../src/app/(platform)/onboarding/OnboardingWizard.tsx');

test('★★★ فحص الرابط لا يُشارك زرّ الإنشاء انتقاله', () => {
  const onBlur = WIZARD.match(/onBlur=\{\(\)\s*=>\s*(\w+)\(/);
  assert.ok(onBlur, 'لم يعد هناك فحص عند الخروج من الحقل — راجع الحارس');
  assert.notEqual(onBlur[1], 'start',
    'فحص الرابط يبدأ نفس انتقال الإرسال: `pending` يعطّل الزرّ فتضيع أوّل ضغطة');
});

test('★★ وزرّ الإنشاء لا يُعطَّل أثناء الفحص', () => {
  const btn = WIZARD.match(/<Button type="submit"[^>]*disabled=\{([^}]*)\}/);
  assert.ok(btn, 'لم يُعثر على زرّ الإرسال');
  assert.ok(!/checking/.test(btn[1]),
    `الزرّ يُعطَّل أثناء الفحص (${btn[1].trim()}) — والقاعدة هي الحاجز الحقيقي، `
    + 'فالتعطيل لا يمنع خطأً ويبتلع الضغطة');
});

test('★ والتعطيل على «محجوز» يبقى — منعُ إرسالٍ نعرف أنه سيفشل', () => {
  const btn = WIZARD.match(/<Button type="submit"[^>]*disabled=\{([^}]*)\}/);
  assert.match(btn![1], /taken/, 'سقط التعطيل على الرابط المحجوز');
});
