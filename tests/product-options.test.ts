import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * ═══════════════════════════════════════════════════════════════════
 * خيارات المنتج: الخاصّية كانت مبنيّة كلّها إلا طرفها الظاهر.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ★★★ الحال قبل 0070: جدول `product_variants` منذ 0004، ومخزونٌ لكل
 * خيار، وسلّةٌ وطلبٌ يحملان `variant_id`، و`VariantPicker` في صفحة
 * المنتج يتبع سعر المختار — ولا دالّة كتابة ولا شاشة. فلم يُنشئ تاجرٌ
 * خيارًا واحدًا منذ الإطلاق، ولا عنصر سلّةٍ واحد حمل `variant_id`.
 * خاصّيةٌ كاملةٌ معطّلة بغياب زرّ.
 */

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');

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
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ═══════════════════════════════════════════════════════════════════
// حركةُ مخزونٍ بلا خيار تذهب إلى الصفّ الخطأ
// ═══════════════════════════════════════════════════════════════════

/**
 * ★★★ العطل الذي يحرسه: `inventory` صفٌّ لكل (منتج · خيار) وصفٌّ أساس.
 * وصفحة المخزون كانت تُمرّر `productId` وحده إلى `InventoryAdjuster`،
 * فكل زيادةٍ أو إنقاصٍ على أيّ لونٍ تذهب إلى **الصفّ الأساس**: التاجر
 * يرى الرقم يتغيّر، والزبون يرى «نفد» لأن رصيد اللون لم يُمَسّ.
 *
 * ★★ ولم يظهر هذا قبل اليوم لأن لا تاجر كان يملك خيارات أصلًا — فتح
 * المسار يفتح العطل معه. ولهذا الحارس يُكتب مع الخاصّية لا بعدها.
 */
test('★★★ تعديل المخزون يحمل الخيار لا المنتج وحده', () => {
  const adjuster = stripComments(read('src/components/dashboard/InventoryAdjuster.tsx'));
  const call = /adjustInventory\(\{[\s\S]*?\}\)/.exec(adjuster);
  assert.ok(call, 'لم يُعثر على نداء `adjustInventory` — المطابِق انكسر');
  assert.match(call[0], /variantId/,
    'النداء بلا `variantId`: كل حركةٍ على أي لون تذهب إلى الصفّ الأساس');

  const page = stripComments(read('src/app/(dashboard)/dashboard/inventory/page.tsx'));
  assert.match(page, /<InventoryAdjuster[\s\S]{0,320}?variantId=\{/,
    'صفحة المخزون لا تُمرّر الخيار إلى المُعدِّل');
});

test('★★ وصفوف المخزون مفاتيحها الخيار — وإلا تصادمت صفوف منتجٍ واحد', () => {
  // منتجٌ بثلاثة ألوان = ثلاثة صفوف بنفس `product.id`. مفتاحٌ مكرّر في
  // React يُفقد الصفوف تمييزها، فيُعاد استعمال حالة صفٍّ لصفٍّ آخر.
  const page = stripComments(read('src/app/(dashboard)/dashboard/inventory/page.tsx'));
  assert.match(page, /key=\{row\.variant_id \?\? product\.id\}/,
    'مفتاح الصفّ لا يميّز الخيار');
  assert.match(page, /product_variants\(name/,
    'الاستعلام لا يجلب اسم الخيار — فتتشابه الصفوف على التاجر');
});

// ═══════════════════════════════════════════════════════════════════
// الكتابة بالدالّة لا بالجدول (قاعدة ٤ج)
// ═══════════════════════════════════════════════════════════════════

test('★★★ لا كتابة مباشرة على `product_variants` من الكود', () => {
  // ★ السقف (٥٠ خيارًا للمنتج) والتحقّق كلّه داخل `save_variant`.
  //   وكتابةٌ مباشرة من العميل تتخطّاه، كما كانت المنحة على الجدول
  //   تتخطّاه قبل 0070.
  const bad: string[] = [];
  for (const file of sourceFiles('src/')) {
    const code = stripComments(read(file));
    for (const m of code.matchAll(
      /from\('product_variants'\)\s*\.\s*(insert|update|upsert|delete)/g,
    )) bad.push(`${file}: .${m[1]}()`);
  }
  assert.deepEqual(bad, [],
    'كتابة مباشرة على جدول الخيارات تتخطّى السقف والتحقّق:\n' + bad.join('\n'));
});

test('★★ وشاشة الخيارات موصولة بصفحة تعديل المنتج', () => {
  // ★ هذا هو العطل نفسه: الخاصّية كانت كاملة والشاشة غائبة. حارسٌ
  //   يمنع أن يعود الحال كما كان بإزالةٍ عابرة.
  const page = read('src/app/(dashboard)/dashboard/products/[id]/edit/page.tsx');
  assert.match(page, /<ProductVariantsManager/,
    'صفحة تعديل المنتج بلا شاشة خيارات — فلا مسار للتاجر مرّة أخرى');
  const manager = stripComments(read('src/components/dashboard/ProductVariantsManager.tsx'));
  assert.match(manager, /saveProductVariant/, 'الشاشة لا تنادي فعل الحفظ');
  assert.match(manager, /deleteProductVariant/, 'الشاشة لا تنادي فعل الحذف');
});

test('★★ وحقول الشاشة كلّها `w-full` — `<input>` بعرضٍ ذاتيّ يمدّ الصفحة', () => {
  // مزلق مُوثَّق في CLAUDE.md: لـ`<input>` عرضٌ ذاتيّ من `size=20`،
  // و`min-w-0` لا يمنعه من المساهمة في `min-content` فيمدّ الصفحة
  // أفقيًّا على الهاتف. هذه شاشةٌ جديدة فيها عشرة حقول.
  const manager = read('src/components/dashboard/ProductVariantsManager.tsx');
  const inputs = [...manager.matchAll(/<Input\b[\s\S]*?\/>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 6, `لم يُعثر إلا على ${inputs.length} حقل — المطابِق انكسر`);
  const narrow = inputs.filter((i) => !/className="[^"]*w-full/.test(i));
  assert.deepEqual(narrow.map((i) => i.slice(0, 60)), [],
    'حقلٌ بلا `w-full` — يمدّ صفحة الهاتف أفقيًّا');
});
