import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * ═══════════════════════════════════════════════════════════════════
 * أربعة ثقوب في المتجر العادي — حرّاس تمنع عودتها.
 *
 * كلّها كانت **مكسورة** لا ناقصة: بيعٌ لا يتمّ، صورٌ لا تستجيب، ووعدُ
 * دفعٍ يخالف إعدادات التاجر. وكلٌّ منها قابل للكسر بتعديلٍ حسن النيّة
 * لا يكشفه اختبار سلوكي، لأن لا شيء يرمي خطأً — الصفحة تُرسَم، والبيع
 * وحده هو ما لا يحدث.
 * ═══════════════════════════════════════════════════════════════════
 */

const PDP = code('../src/app/(storefront)/sites/[host]/products/[slug]/page.tsx');
const HOME = code('../src/app/(storefront)/sites/[host]/page.tsx');
const PICKER = code('../src/components/storefront/VariantPicker.tsx');
const GALLERY = code('../src/components/storefront/ProductGallery.tsx');

// ═══════════════════════════════════════════════════════════════════
// ١) المنتج ذو المتغيّرات يُباع فعلًا
// ═══════════════════════════════════════════════════════════════════

test('★★★ صفحة المنتج ترسم مُختار المتغيّرات لا تجلبها وتهملها', () => {
  assert.ok(/product_variants\(/.test(PDP), 'المتغيّرات لم تعد تُجلب');
  assert.ok(/<VariantPicker/.test(PDP),
    'المتغيّرات تُجلب ولا تُرسَم — الزبون لا يختار، والسلّة تأخذ المنتج الأساس');
});

test('★★★ ومعرّف المتغيّر يصل السلّة', () => {
  assert.ok(/variantId=\{current\.id\}/.test(PICKER),
    'الزرّ يُنادى بلا `variantId` — الخيار يضيع بين الصفحة والسلّة');
});

test('★★★ وتوفّر المتغيّر يُقرأ وحده لا مجموعًا', () => {
  // جمع مخزون المقاسات كلّها كان يَعِد بتوفّر مقاسٍ نفد.
  assert.ok(/variant_id/.test(PDP), '`variant_id` لا يُجلب مع المخزون');
  assert.ok(/i\.variant_id === variantId/.test(PDP),
    'المخزون لا يُرشَّح بالمتغيّر — رصيدٌ مجموع يَعِد بما نفد');
  assert.ok(/available=\{current\.available\}/.test(PICKER),
    'الزرّ لا يقرأ رصيد المختار');
});

test('★★★ ولا سعر يُرسَل من العميل — المعرَّف فقط', () => {
  assert.ok(!/\bprice:\s*(current|v)\./.test(PICKER), 'سعرٌ يُرسَل من المتصفّح');
  assert.ok(!/\bamount\b|\btotal\b/.test(PICKER), 'مبلغٌ يُحسب في المتصفّح');
});

// ═══════════════════════════════════════════════════════════════════
// ٢) الصور المصغّرة حيّة
// ═══════════════════════════════════════════════════════════════════

test('★★★ الصور المصغّرة تبدّل الصورة الكبيرة', () => {
  assert.ok(/<ProductGallery/.test(PDP), 'الصفحة لا تستعمل المعرض');
  assert.ok(/onClick=\{\(\) => setActive\(i\)\}/.test(GALLERY),
    'المصغّرات بلا نقر — أربعة مربّعات لا تستجيب في كل صفحة منتج');
  assert.ok(/images\[active\]/.test(GALLERY),
    'الصورة الكبيرة ثابتة على الأولى مهما نُقر');
});

test('★★ وهي أزرار يصلها التركيز لا عناصر قائمة', () => {
  assert.ok(/<button[\s\S]{0,400}?onClick=\{\(\) => setActive/.test(GALLERY),
    'المصغّر ليس زرًّا — لا يصله التركيز بلوحة المفاتيح');
  assert.ok(/aria-current=/.test(GALLERY), 'لا إعلان عن المصغّر المعروض');
});

test('★★ والأولوية للصورة الأولى وحدها (مؤشّر LCP كما كان)', () => {
  assert.ok(/priority=\{active === 0\}/.test(GALLERY),
    'الأولوية ثابتة أو غائبة — إمّا تزاحم الصور أو يتأخّر LCP');
});

// ═══════════════════════════════════════════════════════════════════
// ٣) لا وعدَ دفعٍ يخالف إعدادات التاجر
// ═══════════════════════════════════════════════════════════════════

test('★★★ طرق الدفع في صفحة المنتج من الإعدادات لا نصًّا ثابتًا', () => {
  assert.ok(!/الدفع عند الاستلام أو تحويل بنكي/.test(PDP),
    'عاد النصّ الثابت: متجرٌ أغلق الدفع عند الاستلام يَعِد به');
  for (const flag of ['codEnabled', 'bankTransferEnabled', 'bankakEnabled']) {
    assert.ok(new RegExp(`chrome\\.${flag}`).test(PDP), `${flag} لا يُقرأ`);
  }
  assert.ok(/\{payLine\}/.test(PDP), 'السطر المشتقّ لا يُعرَض');
});

test('★★ والقشرة نداءٌ مخزَّن داخل نفس `Promise.all` لا استعلامٌ متسلسل', () => {
  const at = PDP.indexOf('Promise.all');
  const block = PDP.slice(at, PDP.indexOf('])', at));
  assert.ok(/storeChrome\(store\.storeId\)/.test(block),
    'القشرة خارج الجلب المتوازي — كلفةٌ متسلسلة على صفحة هي ٣٠٪ من الحركة');
});

// ═══════════════════════════════════════════════════════════════════
// ٤) رابط المتجر له صورة معاينة
// ═══════════════════════════════════════════════════════════════════

test('★★★ رئيسية المتجر تُعلن صورة معاينة للرابط', () => {
  const at = HOME.indexOf('openGraph');
  assert.ok(at >= 0, 'لا بيانات OpenGraph');
  const block = HOME.slice(at, at + 400);
  assert.ok(/images:/.test(block),
    'رابط المتجر يظهر في واتساب نصًّا عاريًا — وهو الأكثر مشاركة');
});

test('★★ ولا صورة تُخترع لمن لم يرفع شيئًا', () => {
  assert.ok(/chrome\.bannerUrl \?\? chrome\.logoUrl/.test(HOME),
    'المعاينة لا تُشتقّ من أصول التاجر');
  assert.ok(/preview \? \[preview\] : undefined/.test(HOME),
    'صورةٌ افتراضية تُعرض باسم التاجر دون أن يرفعها');
});
