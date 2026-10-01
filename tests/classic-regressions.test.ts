import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * ═══════════════════════════════════════════════════════════════════
 * حرّاس عطبين حقيقيّين في المتجر العادي.
 *
 * ★★ لماذا ملفٌّ مستقلّ: هذان الإصلاحان وُلدا أثناء عمل القالب
 * الرقمي، فعاشت حرّاسهما في مواصفته. وحين حُذف القالب كان أسهل شيءٍ
 * أن تُحذف معه — فيعود العطبان بلا كاشف. وكلاهما **لا علاقة له**
 * بالقالب: يضرب المتجر العادي كما يضرب غيره، ولذلك نُقلا إلى هنا
 * بدل أن يُفقدا.
 *
 * ★ والهجرات نفسها باقية كما هي ومطبَّقة على الإنتاج. لا تُعدَّل
 * هجرةٌ مطبَّقة؛ يُحرَس محتواها.
 * ═══════════════════════════════════════════════════════════════════
 */

const MIG58 = read('../supabase/migrations/0058_digital_theme.sql');
const MIG59 = read('../supabase/migrations/0059_digital_orders.sql');

// ═══════════════════════════════════════════════════════════════════
// ١) شحنٌ ثانٍ لمنتج بلا تتبّع مخزون كان يفشل
// ═══════════════════════════════════════════════════════════════════

/**
 * العطب كما شُغِّل وأُثبت: `transition_order` كانت تُدرج حركة مخزون
 * لكل سطر **بلا شرط**، فمنتجٌ بـ`track_inventory = false` لا يملك صفّ
 * مخزون أصلًا ⇒ شحنه **الثاني** يخرق `inventory_non_negative`.
 *
 * والإصلاح احترام `track_inventory` — بلا إرخاء القيد وبلا كمية
 * مخترعة. وهذا مسارٌ عاديّ تمامًا: أيّ تاجر يبيع خدمةً أو منتجًا بلا
 * مخزون يقع فيه.
 */
test('★★★ `transition_order` تحترم `track_inventory` في الشحن والإلغاء', () => {
  const at = MIG58.indexOf('function public.transition_order');
  assert.ok(at >= 0, '`transition_order` لم تُعد تُعرَّف في 0058');
  const body = MIG58.slice(at, MIG58.indexOf('$$;', at));
  const guards = body.match(/coalesce\(v_track, false\)/g) ?? [];
  assert.ok(guards.length >= 2,
    'الحارس ناقص: يجب أن يشمل فرع الشحن وفرع الإلغاء معًا');
  assert.ok(body.includes('select track_inventory into v_track from public.products'),
    'التتبّع لا يُقرأ من المنتج');
  // ولا يُرخى القيد ولا تُخترع كمية
  assert.ok(!/inventory_non_negative/.test(body), 'قيد المخزون مُسّ');
});

test('★★★ ولم يُرخَ قيد المخزون في الهجرتين', () => {
  for (const [name, sql] of [['0058', MIG58], ['0059', MIG59]] as const) {
    assert.ok(!/drop constraint inventory_non_negative/i.test(sql),
      `${name}: قيد عدم السلبية أُسقط`);
    assert.ok(!/alter table public\.inventory\b/i.test(sql),
      `${name}: جدول المخزون عُدِّل`);
  }
});

// ═══════════════════════════════════════════════════════════════════
// ٢) زرّ «التالي» كان يَعلَق معطَّلًا في خطوة أوّل منتج
// ═══════════════════════════════════════════════════════════════════

/**
 * العطب: الزرّ كان مربوطًا بـ`products.length` وحده — وهو عدٌّ محلّيّ
 * يأتي من نداء قائمةٍ في المتصفّح. فيبقى الزرّ معطَّلًا في حالتين:
 *
 *  · قبل أن يعود النداء (كلّ دخول للخطوة)، ولو كان للمتجر منتجاتٌ.
 *  · وإذا فشل النداء (شبكة أو خادم) يبقى `products` فارغًا **إلى
 *    الأبد**، فيَعلَق التاجر في خطوةٍ استوفى شرطها — طريقٌ مسدود.
 *
 * والاحتياط هو العدّ الخادمي الآتي مع الصفحة من القاعدة، وهو نفسه
 * الشرط الذي يفحصه `publish_store` (منتج واحد غير محذوف).
 */
test('★★ زرّ «التالي» في خطوة أوّل منتج لا يَعلَق على عدٍّ محلّي وحده', () => {
  const F = code('../src/app/(platform)/onboarding/FirstProductStep.tsx');
  assert.ok(/const known = loading \|\| error \? count : products\.length/.test(F),
    'لا احتياط بالعدّ الخادمي: الزرّ يَعلَق معطَّلًا إن فشل نداء القائمة');
  assert.ok(/disabled=\{known === 0\}/.test(F), 'الزرّ ما زال مربوطًا بالعدّ المحلّي وحده');
  assert.ok(!/disabled=\{products\.length === 0\}/.test(F), 'الشرط القديم باقٍ');
});
