import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

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

/** كل ملفات واجهة المتجر — المكوّنات والصفحات معًا. */
function storefrontFiles(dir = '../src/components/storefront/', out: string[] = []): string[] {
  for (const entry of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) storefrontFiles(`${path}/`, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  if (dir === '../src/components/storefront/') storefrontFiles('../src/app/(storefront)/', out);
  return out;
}

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
  //
  // ★ الآلية تغيّرت والقصد لم يتغيّر: كان الرصيد يُرشَّح من صفوف
  //   `inventory` بـ`variant_id` — وهي صفوفٌ لا يقرأها الزائر أصلًا
  //   (RLS بلا سياسة لـanon) فكانت كلّها «نافدة». صار لكلّ خيارٍ
  //   عمودُه المنشور `product_variants.in_stock` (0065).
  assert.ok(/product_variants\([^)]*in_stock/.test(PDP),
    'توفّر الخيار لا يُجلب — رصيدٌ مجموع يَعِد بما نفد');
  assert.ok(/v\.in_stock/.test(PDP),
    'توفّر الخيار لا يُقرأ لكلّ خيار على حدة');
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

// ═══════════════════════════════════════════════════════════════════
// الدفعة الثانية — تحويل: الشريط الثابت · المشاركة · أجرة التوصيل
// ═══════════════════════════════════════════════════════════════════

const STICKY = code('../src/components/storefront/StickyBuyBar.tsx');
const SHARE = code('../src/components/storefront/ShareProduct.tsx');
const DELIV = code('../src/lib/delivery/summary.ts');

test('★★ الشريط الثابت لا يكرّر زرّ الإضافة ولا حالة السلّة', () => {
  // تكرار الزرّ = حالة كمّية ومتغيّر ثانية تخالف الأولى: زبونٌ يختار
  // مقاسًا فوق ويشتري غيره تحت.
  assert.ok(!/AddToCartButton|addToCart/.test(STICKY),
    'الشريط يضيف إلى السلّة بنفسه — حالتان متعارضتان للمتغيّر والكمّية');
  assert.ok(/scrollIntoView/.test(STICKY), 'الشريط لا يقود إلى صندوق الشراء');
  assert.ok(/id="buy-box"/.test(PDP), 'صندوق الشراء بلا معرّف يرصده الشريط');
});

test('★★ ويظهر برصد التقاطع لا بمستمع تمرير', () => {
  assert.ok(/IntersectionObserver/.test(STICKY), 'لا رصد تقاطع');
  assert.ok(!/addEventListener\(\s*['"]scroll/.test(STICKY),
    'مستمع تمرير يوقظ الخيط في كل إطار');
  assert.ok(/io\.disconnect\(\)/.test(STICKY), 'الراصد لا يُفصَل — تسريب');
});

test('★★★ ولا يُعرض لمتجر لا يبيع الآن', () => {
  assert.ok(/store\.canCheckout && available > 0 && \(\s*<StickyBuyBar/.test(PDP),
    'زرٌّ عائم يقود إلى رسالة منع، أو إلى منتج نفد');
});

test('★★ رابط المشاركة يُقرأ من المتصفّح لا يُبنى في الصفحة المخزَّنة', () => {
  // الصفحة واحدة لكل الزوّار؛ بناء الرابط فيها حقنُ قيمة في HTML مشترك.
  assert.ok(/window\.location\.href/.test(SHARE), 'الرابط لا يُقرأ من المتصفّح');
  assert.ok(/wa\.me/.test(SHARE), 'لا مشاركة واتساب — قناة التوزيع الأولى');
  assert.ok(/encodeURIComponent/.test(SHARE), 'نصّ المشاركة بلا ترميز');
});

test('★★★ أجرة التوصيل حقيقية من `delivery_zones` لا وعدٌ عامّ', () => {
  assert.ok(/delivery_zones/.test(DELIV), 'المناطق لا تُقرأ');
  assert.ok(/is_active.*true|eq\('is_active', true\)/.test(DELIV),
    'مناطق معطَّلة تدخل الحساب');
  assert.ok(/deleted_at/.test(DELIV), 'مناطق محذوفة تدخل الحساب');
  assert.ok(/التوصيل من \$\{formatMoney\(delivery\.minFee\)\}/.test(PDP),
    'الأجرة لا تُعرض في صفحة المنتج');
});

test('★★ وتُبطَل بنفس وسم أفعال التوصيل', () => {
  // وإلا بقي سعرٌ قديم معروضًا بعد تعديل التاجر حتى تنتهي مدّة التخزين.
  assert.ok(/tags: \[storeTag\(storeId, 'settings'\)\]/.test(DELIV),
    'وسم الإبطال لا يطابق `delivery/actions.ts`');
  const ACT = code('../src/lib/delivery/actions.ts');
  assert.ok(/storeTag\(membership\.storeId, 'settings'\)/.test(ACT),
    'أفعال التوصيل غيّرت وسمها — الملخّص لن يُبطَل');
});

test('★★ و«مجاني فوق X» تصدق على منطقة واحدة على الأقلّ', () => {
  assert.ok(/Math\.min\(\.\.\.frees\)/.test(DELIV),
    'العتبة ليست الأدنى — وعدٌ لا يتحقّق في أرخص منطقة');
});

test('★★ وتفشل مفتوحةً: لا سطر توصيل خيرٌ من صفحة لا تُفتح', () => {
  assert.ok(/catch \{ return null; \}/.test(DELIV), 'سقوط الاستعلام يُسقط الصفحة');
});

// ═══════════════════════════════════════════════════════════════════
// الدفعة الثالثة — نضج: مرشّح السعر · تكبير الصورة
// ═══════════════════════════════════════════════════════════════════

const SF = code('../src/lib/products/storefront.ts');
const API = code('../src/app/(storefront)/sites/[host]/api/products/route.ts');
const BROWSER = code('../src/components/storefront/ProductBrowser.tsx');

test('★★★ نطاق السعر شرطٌ في القاعدة لا ترشيحٌ بعد الجلب', () => {
  // الترشيح بعد الجلب يكسر العدّ والترقيم: «٢٤ نتيجة» وتُعرض ستّ.
  assert.ok(/query\.gte\('price', input\.minPrice\)/.test(SF), 'الحدّ الأدنى لا يُطبَّق');
  assert.ok(/query\.lte\('price', input\.maxPrice\)/.test(SF), 'الحدّ الأعلى لا يُطبَّق');
  assert.ok(!/\.filter\(\(p\) => p\.price/.test(SF), 'ترشيحٌ بعد الجلب');
});

test('★★★ والحدّان في مفتاح التخزين — وإلا خُدم نطاقٌ لطالب غيره', () => {
  const at = SF.indexOf("const key = [");
  const block = SF.slice(at, SF.indexOf('];', at));
  assert.ok(/minPrice/.test(block) && /maxPrice/.test(block),
    'المفتاح لا يحمل الحدّين: مدخلٌ مخزَّن واحد لنطاقات مختلفة');
});

test('★★★ وحدّ السعر من العميل يُتحقَّق منه', () => {
  assert.ok(/Number\.isFinite\(n\) \|\| n < 0/.test(API), 'قيمة غير رقمية أو سالبة تمرّ');
  assert.ok(/Math\.min\(n, MAX_PRICE\)/.test(API), 'لا سقف — رقمٌ ضخم يُفقد الفهرس فائدته');
  // `Number('')` صفرٌ لا NaN: الحقل الفارغ كان سيصير «أقلّ من صفر».
  assert.ok(/raw\.trim\(\) === ''/.test(API), 'الفارغ يُقرأ صفرًا فتختفي كل المنتجات');
});

test('★★ وحدّان مقلوبان يُعدَّلان لا يُعادان بصفر نتيجة', () => {
  assert.ok(/minPrice > maxPrice/.test(API), 'لا معالجة للنطاق المقلوب');
  assert.ok(/\[minPrice, maxPrice\] = \[maxPrice, minPrice\]/.test(API), 'لا تبديل');
});

test('★★★ ونطاقٌ مضبوط ليس «الافتراضي» الذي صيَّره الخادم', () => {
  // وإلا عُدَّ افتراضيًّا فعادت القائمة كاملة بلا ترشيح.
  assert.ok(/min === '' && max === ''/.test(BROWSER),
    'شرط الافتراضي لا يشمل النطاق — الترشيح يُهمَل صامتًا');
  assert.ok(/\$\{min\}\|\$\{max\}/.test(BROWSER), 'مفتاح إعادة الجلب لا يحمل النطاق');
});

test('★★ والترشيح يُطبَّق بإرسالٍ صريح لا عند كل ضغطة مفتاح', () => {
  // «١٠٠٠» تمرّ بـ«١» و«١٠» و«١٠٠»: ثلاثة طلبات لنتائج لا يريدها أحد.
  assert.ok(/onSubmit=\{\(e\) => \{ e\.preventDefault\(\); onApply/.test(BROWSER),
    'لا إرسال صريح');
  assert.ok(!/onChange=\{\(e\) => onApply/.test(BROWSER), 'طلبٌ عند كل ضغطة');
});

test('★★ تكبير الصورة يُغلق بـEscape ولا يحبس من يستعمل لوحة المفاتيح', () => {
  assert.ok(/e\.key === 'Escape'/.test(GALLERY), 'لا إغلاق بلوحة المفاتيح');
  assert.ok(/aria-modal="true"/.test(GALLERY), 'الطبقة ليست حوارًا معلنًا');
  assert.ok(/removeEventListener\('keydown', onKey\)/.test(GALLERY), 'المستمع لا يُرفع');
  assert.ok(/document\.body\.style\.overflow = prev/.test(GALLERY),
    'تمرير الصفحة يبقى مجمَّدًا بعد الإغلاق');
});

test('★★ والصورة المكبَّرة تُعرض كاملة لا مقصوصة', () => {
  const at = GALLERY.indexOf('aria-modal');
  assert.ok(/object-contain/.test(GALLERY.slice(at)),
    'القصّ في التكبير يناقض سببه');
});

// ═══════════════════════════════════════════════════════════════════
// الدفعة الرابعة — «المتوفّر فقط» و«نبّهني عند التوفّر»
// ═══════════════════════════════════════════════════════════════════

const MIG64 = read('../supabase/migrations/0064_stock_alerts.sql');
const ALERT = code('../src/components/storefront/StockAlertForm.tsx');
const SACT = code('../src/lib/stock/actions.ts');
const MAIL = code('../src/lib/email/templates.ts');

test('★★★ التوفّر يحترم الحجز — لا تقريبَ `quantity > 0`', () => {
  // التقريب كان يَعِد بتوفّر ما كلّ كمّيته محجوزة في طلبات معلّقة.
  assert.ok(/\(i\.quantity - i\.reserved\) > 0/.test(MIG64),
    'الحجز لا يُطرح: منتجٌ محجوزٌ بالكامل يُعلَن متوفّرًا');
  assert.ok(/when not new\.track_inventory then true/.test(MIG64),
    'منتجٌ بلا تتبّع مخزون يختفي من الترشيح');
});

test('★★★ والعمود يُفرَض بمحفّز لا بمنحة — المنحة لا تكفي', () => {
  // `authenticated` يملك `update` على مستوى الجدول منذ 0004، و
  // `revoke update (col)` لا يُنقص منها. جُرِّب فسقط الاختبار.
  assert.ok(/create trigger products_sync_in_stock\s+before update on public\.products/
    .test(MIG64.replace(/\s+/g, ' ').replace(/create trigger/g, '\ncreate trigger'))
    || /before update on public\.products/.test(MIG64),
    'لا محفّز BEFORE على كل تحديث: قيمةٌ مزوّرة تثبت');
  assert.ok(/new\.in_stock := case/.test(MIG64),
    'المحفّز لا يُعيد الحساب — يقبل ما يكتبه العميل');
});

test('★★★ ولا كتابة على المنتج بلا تغيّر فعليّ في التوفّر', () => {
  // بدونها صار كل حجزٍ وإفراج كتابةً تُبطل تخزين صفحات المتجر كلّها.
  assert.ok(/in_stock is distinct from v_now/.test(MIG64),
    'كل حركة مخزون تكتب على `products` فتُبطل التخزين بلا داعٍ');
});

test('★★ والترشيح يقرأ العمود ويدخل مفتاح التخزين', () => {
  assert.ok(/query\.eq\('in_stock', true\)/.test(SF), 'الترشيح لا يستعمل العمود');
  assert.ok(/input\.inStock \? 'in' : '-'/.test(SF),
    'التوفّر خارج مفتاح التخزين: نتائج مرشَّحة تُخدَم لمن لم يرشّح');
});

test('★★★ طلب التنبيه: المتجر من المنتج لا من العميل', () => {
  assert.ok(!/p_store_id/.test(SACT),
    '`store_id` يُرسَل من المتصفّح — تعليقُ بريدٍ على متجرٍ آخر');
  assert.ok(/select p\.store_id, p\.in_stock into v_store/.test(MIG64),
    'القاعدة لا تشتقّ المتجر من المنتج');
});

test('★★★ ولا يُسجَّل تنبيهٌ لمنتج متوفّر أو متجرٍ متوقّف', () => {
  assert.ok(/IN_STOCK: /.test(MIG64), 'تنبيهٌ لمنتج متوفّر أصلًا');
  assert.ok(/s\.status = 'active' and s\.deleted_at is null/.test(MIG64),
    'متجرٌ متوقّف أو محذوف يقبل طلبات تنبيه');
  assert.ok(/check_rate_limit\('stockalert:/.test(MIG64), 'بلا حدّ معدّل');
});

test('★★★ وقائمة البُرُد غير مقروءة لأيّ دور عميل', () => {
  assert.ok(/revoke all on public\.stock_alerts from anon, authenticated/.test(MIG64),
    'قائمة بُرُدٍ تنتظر منتجًا بيانٌ شخصيّ');
  assert.ok(/enable row level security/.test(MIG64), 'الجدول بلا RLS');
});

test('★★★ والتنبيه يُرسَل فعلًا — لا قائمةٌ تُجمَع ولا يُنبَّه أحد', () => {
  assert.ok(/insert into public\.email_outbox/.test(MIG64),
    'لا إدراج في طابور البريد: ميزةٌ تجمع بُرُدًا ولا تُنبّه');
  assert.ok(/'stock_back'/.test(MIG64) && /stock_back:/.test(MAIL),
    'القالب غير مسجَّل — بريدٌ بقالبٍ مجهول لا يُرسَل');
  assert.ok(/dedupe_key/.test(MIG64), 'بلا مفتاح منع تكرار');
  assert.ok(/new\.in_stock and not old\.in_stock/.test(MIG64),
    'يُرسل على كل كتابة لا عند العودة وحدها');
});

test('★★ ونموذج التنبيه لا يُعرض لمتجرٍ لا يبيع', () => {
  assert.ok(/available <= 0 && store\.canCheckout \?\s*\(\s*<StockAlertForm/
    .test(PDP.replace(/\s+/g, ' ')),
    'وعدُ تنبيهٍ من متجرٍ متوقّف وعدٌ لا يُوفى');
});

test('★★ والتحقّق في القاعدة لا في الواجهة وحدها', () => {
  assert.ok(/INVALID_EMAIL/.test(MIG64), 'صحّة البريد في المتصفّح وحده — تُتخطّى');
  assert.ok(!/\.test\(email\)/.test(ALERT) || /required/.test(ALERT),
    'لا تحقّق أساسي في النموذج');
});

// ═══════════════════════════════════════════════════════════════════
// معاينة الرابط في واتساب — ما يراه المشتري قبل أن يفتح
// ═══════════════════════════════════════════════════════════════════

test('★★★ السعر أوّل وصف المعاينة لا آخره', () => {
  // واتساب يقصّ الوصف بعد سطرين؛ سعرٌ في الذيل لا يصل المشتري أبدًا.
  assert.ok(/\[formatMoney\(product\.price\), body\]/.test(PDP),
    'السعر ليس أوّل الوصف — المعاينة تبدو خبرًا لا عرضَ بيع');
  assert.ok(/\.slice\(0, 200\)/.test(PDP), 'الوصف بلا حدّ طول');
});

test('★★ وأبعاد الصورة مُعلَنة فتكبر البطاقة', () => {
  // بدونها يخمّن الزاحف الحجم فتظهر مصغَّرةً جانبيّة.
  assert.ok(/media_files\(bucket, path, blur_data_url, width, height\)/.test(PDP),
    'الأبعاد لا تُجلب رغم وجودها في `media_files` منذ 0004');
  assert.ok(/cover\.width \? \{ width: cover\.width \}/.test(PDP), 'العرض لا يُعلَن');
  assert.ok(/summary_large_image/.test(PDP), 'بطاقة صغيرة حيث تمكن الكبيرة');
});

test('★★★ ورابط المشاركة مقروء لا مشفَّر', () => {
  // سَلَك عربيّ يظهر سطرًا من `%D8%A7%D8%AF...` لا يقرؤه أحد.
  assert.ok(/decodeURI\(raw\)/.test(SHARE),
    'الرابط يُشارَك مشفَّرًا — سطرٌ غير مقروء لا يُطمئن من يستقبله');
  assert.ok(!/decodeURIComponent\(raw\)/.test(SHARE),
    '`decodeURIComponent` تفكّ الشرطات المائلة فتكسر الرابط');
  assert.ok(/try \{ return decodeURI\(raw\); \} catch/.test(SHARE),
    'ترميزٌ تالف يرمي استثناءً بلا احتياط');
});

test('★★ ولا اسمَ مكرَّرًا فوق البطاقة', () => {
  assert.ok(!/text = `\$\{name\}/.test(SHARE),
    'الاسم مكرَّر فوق بطاقةٍ تعرضه — حشوٌ يزيح المعاينة');
});

// ═══════════════════════════════════════════════════════════════════
// ٥) التوفّر يُقرأ من عمودٍ منشور لا من مخزونٍ لا يملكه الزائر
//
// ★★★ هذا أخطر ما وُجد: `inventory` عليها RLS بلا سياسة لـanon، فكلّ
// تضمينٍ لها في استعلامٍ عامّ يعود **فارغًا** — لا بخطأ. والنتيجة
// عطلان متعاكسان من جذرٍ واحد: صفحة المنتج تُعلن كلّ منتج متتبَّع
// «نفد» فيختفي زرّ الشراء من كل رابطٍ يُشارَك، والبطاقة في الشبكة
// تَعِد بالشراء حتى لمنتجٍ نفد فعلًا. وقد ثبت على الإنتاج: ٢٤ منتجًا
// متتبَّعًا نشطًا، ٢٣ منها متوفّرة، وصفر صفوف مخزون مرئية للزائر.
//
// ★ ولا اختبار سلوكيّ يكشفه: الصفحة تُرسَم بنجاح، والبيع وحده لا يقع.
//   ويعود بأيّ `select` حسن النيّة يضيف `inventory(...)` من جديد.
// ═══════════════════════════════════════════════════════════════════

const HOMEQ = code('../src/lib/products/home.ts');
const LISTQ = code('../src/lib/products/storefront.ts');
const CARD = code('../src/components/storefront/ProductCard.tsx');
const SHOWCASE = code('../src/components/storefront/ProductShowcase.tsx');

test('★★★ لا استعلام عامّ يضمّن `inventory` — الزائر لا يقرأها', () => {
  for (const [name, src] of [['صفحة المنتج', PDP], ['الرئيسية', HOMEQ],
                             ['قائمة المنتجات', LISTQ]] as const) {
    assert.ok(!/inventory\s*\(/.test(src),
      `${name}: تضمين \`inventory\` في استعلام عامّ يعود فارغًا للزائر `
      + '⇒ توفّرٌ كاذب. استعمل العمود المنشور `in_stock`.');
  }
});

test('★★★ والعمود مطلوبٌ فعلًا في كل استعلام يعرض التوفّر', () => {
  assert.ok(/in_stock/.test(PDP), 'صفحة المنتج لا تجلب `in_stock`');
  assert.ok(/in_stock/.test(HOMEQ), 'الرئيسية لا تجلب `in_stock`');
  assert.ok(/in_stock/.test(LISTQ), 'قائمة المنتجات لا تجلب `in_stock`');
  assert.ok(/product_variants\([^)]*in_stock/.test(PDP),
    'توفّر الخيارات لا يُجلب — جمعُ مخزون المقاسات يَعِد بمقاسٍ نفد');
});

test('★★ والبطاقة تفشل مغلقةً لا مفتوحة', () => {
  // `inv == null` كان يعني «غير متتبَّع» ⇒ تَعِد بالشراء دائمًا.
  for (const [name, src] of [['البطاقة', CARD], ['العرض', SHOWCASE]] as const) {
    assert.ok(/in_stock === false/.test(src),
      `${name}: «نفد» لا يُشتقّ من \`in_stock\` صراحةً`);
    assert.ok(!/inv!\./.test(src), `${name}: ما زالت تقرأ صفوف المخزون`);
  }
});

test('★★ ولا رصيدٌ دقيق يُعرض للزائر', () => {
  // «بقي N فقط» تحتاج رقمًا لا يملكه الزائر — ولم تكن تظهر له قطّ.
  for (const [name, src] of [['البطاقة', CARD], ['العرض', SHOWCASE]] as const) {
    assert.ok(!/بقي \{available\}/.test(src),
      `${name}: تعرض رصيدًا دقيقًا — بيانُ تاجرٍ خاصّ لا يُنشر`);
  }
});

test('★★★ والمنحة العمودية مكتوبة في الهجرة — بدونها يسقط الترشيح', () => {
  const MIG65 = read('../supabase/migrations/0065_public_stock_visibility.sql');
  assert.ok(/grant select \(in_stock\) on public\.products to anon/.test(MIG65),
    '`products` لها منحة أعمدة صريحة لا منحة جدول: عمودٌ جديد لا يدخلها '
    + 'تلقائيًا، و`.eq(\'in_stock\', true)` يسقط بـpermission denied');
  assert.ok(/app\.variant_has_stock/.test(MIG65), 'توفّر الخيار بلا دالّة');
  assert.ok(/before update on public\.product_variants/.test(MIG65),
    'العمود بلا محفّزٍ يصونه — والمنحة العمودية لا تكفي (درس 0064)');
});

// ═══════════════════════════════════════════════════════════════════
// ٦) لا حقل إدخال يمدّ الصفحة أفقيًّا على الهاتف
//
// ★★★ لـ`<input>` عرضٌ ذاتيّ من `size=20` (٣٠٦ بكسل بخطّ الموقع).
// و`min-w-0` يسمح له بالانكماش داخل المساحة المتاحة، لكنّه **لا
// يمنع** عرضه الذاتيّ من المساهمة في `min-content`. وعمود الشبكة في
// صفحة المنتج يُقاس بـ`min-content`، فكان صفّ «نبّهني» يطلب ٤٠٥
// بكسل على شاشة ٣٦٠ ⇒ صفحة المنتج كلّها تتمدّد إلى ٤٢١، والعنوان
// والسعر يُقصّان خارج الشاشة بلا وسيلة للوصول إليهما.
//
// ★ قيس بالمتصفّح: `docW=421` قبل، و`360` بعد إضافة `w-full`.
// ═══════════════════════════════════════════════════════════════════

test('★★★ حقلٌ مرنٌ في صفّ يحمل `w-full` وإلا مدّ الصفحة', () => {
  const files: [string, string][] = [
    ['نموذج التنبيه', code('../src/components/storefront/StockAlertForm.tsx')],
  ];
  for (const [name, src] of files) {
    // كل وسم <input ...> يحمل flex-1 يجب أن يحمل w-full كذلك
    for (const m of src.matchAll(/<input[\s\S]*?\/>/g)) {
      const tag = m[0];
      if (!/flex-1/.test(tag)) continue;
      assert.ok(/\bw-full\b/.test(tag),
        `${name}: حقلٌ بـ\`flex-1\` بلا \`w-full\` — عرضه الذاتيّ `
        + '(size=20) يسرّب إلى `min-content` فيمدّ الصفحة أفقيًّا');
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// ٥) الزائر لا يستدعي ما هو ممنوع عنه
// ═══════════════════════════════════════════════════════════════════

const VIEWER = code('../src/app/(storefront)/sites/[host]/viewer/route.ts');

test('★★ حالة التقييم لا تُطلب من القاعدة بلا جلسة', () => {
  // `product_review_state` ممنوعة على `anon` (0051). وكان المسار
  // يستدعيها لكل زائر فيتلقّى 42501 ويبتلعه ويعيد «سجّل الدخول» —
  // سلوكٌ صحيح قائم على فشل، و٢٣ رفضًا يوميًّا في سجلّ الإنتاج.
  const at = VIEWER.indexOf('reviewState(supabase');
  assert.ok(at > 0, 'لم يعد المسار يستدعي حالة التقييم — تحقّق من الحارس');

  // شرط النداء نفسه لا ما حوله: السطر السابق فيه `signedIn` لسببٍ آخر
  // (المفضّلة)، فقراءة الجوار تمرّر الطفرة.
  const question = VIEWER.lastIndexOf('?', at);
  const condition = VIEWER.slice(VIEWER.lastIndexOf('\n', question), question);
  assert.match(condition, /signedIn/,
    `شرط النداء «${condition.trim()}» بلا فحص جلسة — الزائر يرتدّ بـ42501 في كل صفحة منتج`);
});

// ═══════════════════════════════════════════════════════════════════
// ٦) لا رابط من داخل المتجر يقود إلى 404
// ═══════════════════════════════════════════════════════════════════

/**
 * ★★★ العطل: زرّ «انشر متجرك الآن» كان `href="/dashboard"` داخل قشرة
 * المتجر. ونحن على مضيف المستأجر، فالـproxy يحوّل كل مسار هناك إلى
 * `/_sites/<host>/...` ⇒ **404 مُثبَت على الإنتاج**. ويراه كل صاحب
 * متجر لم يُنشر بعد — وهي أشيع حالة في المنصّة بنصّ تعليق المكوّن
 * نفسه (١١ متجرًا من ٢٤ يوم اكتشافه).
 *
 * ★ ولا يكشفه بناءٌ ولا نوع: الرابط نصٌّ صحيح الشكل، والصفحة تُرسم،
 *   والزرّ يظهر — ولا شيء يفشل إلا عند الضغط.
 */
const PLATFORM_ONLY =
  /href=\{?[`"'](\/(?:dashboard|admin|partner|onboarding|pricing|signup|faq|help|legal)\b[^`"'{]*)/g;

test('★★★ لا رابط جذريّ من المتجر إلى مسار لا يعيش إلا على المنصّة', () => {
  const offenders: string[] = [];
  for (const file of storefrontFiles()) {
    for (const m of code(file).matchAll(PLATFORM_ONLY)) {
      offenders.push(`${file} → ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, [],
    'رابطٌ جذريّ داخل المتجر يبقى على مضيف المستأجر فيردّ 404. '
    + 'استعمل `platformOrigin()` لرابطٍ مطلق:\n' + offenders.join('\n'));
});

test('وزرّ النشر يقود إلى أصل المنصّة فعلًا', () => {
  const HINT = code('../src/components/storefront/DraftOwnerHint.tsx');
  assert.match(HINT, /platformOrigin\(\)\}\/dashboard/,
    'زرّ «انشر متجرك» لا يبني رابطًا مطلقًا إلى لوحة التحكم');
});
