import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * ═══════════════════════════════════════════════════════════════════
 * القالب الرقمي — حرّاس بنيويّة.
 *
 * ثلاث قواعد لا تفاوض فيها، وكلٌّ منها قابلة للكسر بتعديلٍ حسن
 * النيّة، ولن يُكشف الكسر في اختبار سلوكي:
 *
 *  ١) **التجهيز منفصل عن الاستقبال**: البوّابة في `store_can_checkout`
 *     وحدها، ولا تُقيَّد بها أفعال التحرير. ولا يُرفع حدّ باقة كحلّ.
 *  ٢) **صفر انحدار على المتجر العادي**: كل ميزة رقمية مشروطة بالقالب،
 *     ورموز الوضع الداكن مقصورة على شجرة القالب الرقمي.
 *  ٣) **لا شيء شخصي في الصفحة المخزَّنة**: لا كوكي ولا ترويسة في
 *     مسارات القالب الرقمي العامة، ولا تفضيل ثيمٍ في حالة خادمية.
 * ═══════════════════════════════════════════════════════════════════
 */

const MIG58 = read('../supabase/migrations/0058_digital_theme.sql');
const MIG59 = read('../supabase/migrations/0059_digital_orders.sql');
const CHROME = code('../src/lib/tenant/chrome.ts');
const LAYOUT = code('../src/app/(storefront)/sites/[host]/layout.tsx');
const DCHROME = code('../src/components/storefront/digital/DigitalChrome.tsx');
const TOGGLE = code('../src/components/storefront/digital/ThemeToggle.tsx');
const PANEL = code('../src/components/storefront/digital/DigitalBuyPanel.tsx');
const DACTIONS = code('../src/lib/digital/actions.ts');
const DASH = code('../src/lib/digital/dashboard.ts');
// ★ التعليقات تُجرَّد: قسم القالب الرقمي يشرح **لماذا** لا يُعرَّف على
// `:root`، فالبحث في النصّ الخام يُطابق الشرح لا الشفرة — وهذا خطأ في
// أداة القياس لا في الشفرة، ويُصلَح في الأداة.
const CSS = read('../src/app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');

// ═══════════════════════════════════════════════════════════════════
// ١) بوّابة الطلبات — في القاعدة، ومرّة واحدة
// ═══════════════════════════════════════════════════════════════════

test('★★★ الشرط الرقمي داخل `store_can_checkout` لا في بوّابة موازية', () => {
  const fn = MIG58.slice(MIG58.indexOf('function app.store_can_checkout'));
  const body = fn.slice(0, fn.indexOf('$$;'));
  assert.ok(body.includes("app.store_template(s.id) <> 'digital'"),
    'الشرط الرقمي ليس داخل البوّابة القائمة');
  assert.ok(body.includes('app.digital_orders_allowed(s.id)'),
    'الأهلية الرقمية ليست مرتبطة بالبوّابة');
  // والشروط القائمة لم تُمسّ: متجر نشط + اشتراك تشغيلي + لا صيانة
  assert.ok(body.includes("s.status = 'active'"), 'شرط المتجر النشط سقط');
  assert.ok(body.includes('app.subscription_is_operational(sub.status)'),
    'شرط الاشتراك التشغيلي سقط');
  assert.ok(body.includes('maintenance_mode'), 'شرط وضع الصيانة سقط');
});

test('★★★ الأهلية الرقمية = اشتراك تشغيلي على باقة غير مجانية', () => {
  const fn = MIG58.slice(MIG58.indexOf('function app.digital_orders_allowed'));
  const body = fn.slice(0, fn.indexOf('$$;'));
  assert.ok(body.includes('p.is_free = false'),
    'الأهلية لا تشترط باقة مدفوعة');
  assert.ok(body.includes('app.subscription_is_operational(sub.status)'),
    'الأهلية لا تستعمل قواعد الاشتراك القائمة');
  // ★ المفتاح غير المضبوط لا يفتح شيئًا (D18 تعيد true للمُهمَل)
  assert.ok(/r\.configured\s+and\s+r\.bool_value is not null/.test(body),
    'المفتاح غير المضبوط قد يفتح الطلبات — فتحة افتراضية');
});

test('★★★ لا رفع لحدود الباقات ولا تغيير أسعار في أيّ migration رقمية', () => {
  for (const [name, sql] of [['0058', MIG58], ['0059', MIG59]] as const) {
    assert.ok(!/update\s+public\.plans\s+set/i.test(sql),
      `${name} يعدّل جدول الباقات`);
    assert.ok(!/update\s+public\.plan_entitlements\s+set/i.test(sql),
      `${name} يعدّل حدود الباقات`);
    assert.ok(!/set\s+limit_value/i.test(sql), `${name} يضبط حدًّا`);
    assert.ok(!/set\s+price\b/i.test(sql), `${name} يضبط سعرًا`);
  }
  // المفتاح الجديد يولد **غير مضبوط** — قرار ضبطه إداريّ لا كوديّ
  const seed = MIG58.slice(MIG58.indexOf("'digital_store.orders'"));
  assert.ok(!/configured_at/.test(seed.slice(0, 300)),
    'المفتاح الجديد ضُبط من migration — وهذا قرار إداريّ');
});

test('★★★ أفعال التحرير لا تُقيَّد ببوّابة الطلبات', () => {
  // التجهيز يخضع لحدود الباقة (`assert_within_limit`) لا للبوّابة
  for (const fn of ['save_digital_field', 'save_category', 'save_theme_banner',
                    'seed_digital_starter']) {
    const at = MIG59.indexOf(`function public.${fn}`);
    assert.ok(at > 0, `${fn} غير موجودة`);
    const body = MIG59.slice(at, MIG59.indexOf('$$;', at));
    assert.ok(!body.includes('store_can_checkout'),
      `${fn} تُقيَّد ببوّابة الطلبات — فالتاجر لا يستطيع التجهيز قبل الدفع`);
    assert.ok(!body.includes('digital_orders_allowed'),
      `${fn} تُقيَّد بالأهلية الرقمية`);
  }
});

test('★★★ الطلب الرقمي يمرّ بمسار الطلب القائم لا بنسخة منه', () => {
  const at = MIG59.indexOf('function public.create_digital_order');
  const body = MIG59.slice(at, MIG59.indexOf('$$;', at));
  assert.ok(body.includes('public.create_order_with_proof('),
    'الطلب الرقمي لا يستدعي مسار الطلب القائم');
  // ولا يحسب مالًا ولا يلمس مخزونًا بنفسه
  assert.ok(!/insert into public\.orders\b/.test(body),
    'الطلب الرقمي يكتب في `orders` مباشرةً — منطق مكرَّر');
  assert.ok(!/insert into public\.order_items\b/.test(body),
    'الطلب الرقمي يكتب سطور الطلب بنفسه');
  assert.ok(!/public\.inventory\b/.test(body),
    'الطلب الرقمي يلمس المخزون بنفسه');
});

test('★★★ باقة واحدة لكل طلب رقمي — بحكم التوقيع لا بفحصٍ يُنسى', () => {
  const sig = MIG59.slice(MIG59.indexOf('function public.create_digital_order'),
                          MIG59.indexOf('returns table', MIG59.indexOf(
                            'function public.create_digital_order')));
  assert.ok(sig.includes('p_variant_id      uuid'), 'لا معامل باقة واحدة');
  assert.ok(!/p_items\s+jsonb/.test(sig),
    'الطلب الرقمي يقبل قائمة أسطر — فيمكن دسّ باقة ثانية');
});

test('★★★ الحقول المطلوبة تُقرأ من القاعدة لا من العميل', () => {
  const at = MIG59.indexOf('function public.create_digital_order');
  const body = MIG59.slice(at, MIG59.indexOf('$$;', at));
  assert.ok(body.includes('from public.product_digital_fields f'),
    'تعريف الحقول لا يُقرأ من الجدول');
  assert.ok(body.includes('FIELD_REQUIRED'),
    'الحقل الناقص لا يُرفض');
  assert.ok(body.includes("f.is_active and f.deleted_at is null"),
    'الحقول المحذوفة أو المعطَّلة تُطلب من العميل');
});

test('★★★ «تم الشحن» يشترط دفعًا مؤكَّدًا في القاعدة', () => {
  const at = MIG59.indexOf('function public.mark_digital_order_shipped');
  const body = MIG59.slice(at, MIG59.indexOf('$$;', at));
  assert.ok(body.includes("v_order.payment_status <> 'paid'"),
    'التنفيذ لا يشترط تأكيد الدفع');
  assert.ok(body.includes("app.has_store_permission(v_order.store_id, 'orders:update')"),
    'التنفيذ لا يشترط صلاحية');
  // ★ يمرّ بآلة الحالة القائمة، ولا يكتب الحالة مباشرةً
  assert.ok(body.includes('public.transition_order('),
    'التنفيذ لا يمرّ بآلة الحالة');
  assert.ok(!/update public\.orders\s+set\s+status/i.test(body),
    'التنفيذ يكتب حالة الطلب مباشرةً — يتجاوز الآلة وسجلّها');
});

test('★★★ آلة الحالة القائمة لم تُمسّ', () => {
  for (const sql of [MIG58, MIG59]) {
    assert.ok(!/function app\.can_transition_order/.test(sql),
      'آلة الانتقالات أُعيد تعريفها — انحدار على المتجر العادي');
    assert.ok(!/create type public\.order_status/.test(sql),
      'enum حالة الطلب مُسّ');
    assert.ok(!/alter type public\.order_status/.test(sql),
      'أُضيفت حالة إلى enum الطلب');
    assert.ok(!/alter type public\.order_payment_status/.test(sql),
      'أُضيفت حالة إلى enum الدفع');
  }
});

// ═══════════════════════════════════════════════════════════════════
// ٢) إصلاح عطب المخزون
// ═══════════════════════════════════════════════════════════════════

test('★★★ `transition_order` تحترم `track_inventory` في الشحن والإلغاء', () => {
  const at = MIG58.indexOf('function public.transition_order');
  const body = MIG58.slice(at, MIG58.indexOf('$$;', at));
  const guards = body.match(/coalesce\(v_track, false\)/g) ?? [];
  assert.ok(guards.length >= 2,
    'الحارس ناقص: يجب أن يشمل فرع الشحن وفرع الإلغاء معًا');
  assert.ok(body.includes('select track_inventory into v_track from public.products'),
    'التتبّع لا يُقرأ من المنتج');
  // ولا يُرخى القيد ولا تُخترع كمية
  assert.ok(!/inventory_non_negative/.test(body), 'قيد المخزون مُسّ');
});

test('★★★ ولم يُرخَ قيد المخزون في أيّ migration رقمية', () => {
  for (const sql of [MIG58, MIG59]) {
    assert.ok(!/drop constraint inventory_non_negative/i.test(sql),
      'قيد عدم السلبية أُسقط');
    assert.ok(!/alter table public\.inventory\b/i.test(sql),
      'جدول المخزون عُدِّل');
  }
});

// ═══════════════════════════════════════════════════════════════════
// ٣) صفر انحدار على المتجر العادي
// ═══════════════════════════════════════════════════════════════════

test('★★★ لا migration رقمية تحذف أو تُسقط شيئًا قائمًا', () => {
  for (const [name, sql] of [['0058', MIG58], ['0059', MIG59]] as const) {
    assert.ok(!/drop table/i.test(sql), `${name} يحذف جدولًا`);
    assert.ok(!/drop column/i.test(sql), `${name} يحذف عمودًا`);
    assert.ok(!/drop type/i.test(sql), `${name} يحذف نوعًا`);
    assert.ok(!/truncate/i.test(sql), `${name} يفرّغ جدولًا`);
    assert.ok(!/^\s*delete from/im.test(sql), `${name} يحذف صفوفًا`);
    // الـdrop الوحيد المقبول: trigger/policy بـif exists (إعادة تطبيق)
    for (const m of sql.match(/^\s*drop\s+\w+/gim) ?? []) {
      assert.ok(/drop\s+(trigger|policy)/i.test(m),
        `${name} يُسقط ${m.trim()} — وهو ليس trigger ولا policy`);
    }
  }
});

test('★★★ كل ميزة رقمية مشروطة بالقالب في الواجهة', () => {
  // التخطيط والصفحات تفرّع على `chrome.template === \'digital\'`
  assert.ok(LAYOUT.includes("chrome.template === 'digital'"),
    'التخطيط لا يفرّع على القالب');
  for (const p of ['../src/app/(storefront)/sites/[host]/page.tsx',
                   '../src/app/(storefront)/sites/[host]/products/[slug]/page.tsx',
                   '../src/app/(storefront)/sites/[host]/order/page.tsx']) {
    assert.ok(code(p).includes("template === 'digital'"),
      `${p} لا يفرّع على القالب`);
  }
});

test('★★★ القالب الافتراضي `classic` في القاعدة وفي القشرة', () => {
  assert.ok(/storefront_template text not null default 'classic'/.test(MIG58),
    'العمود لا يفترض `classic`');
  assert.ok(/check \(storefront_template in \('classic', 'digital'\)\)/.test(MIG58),
    'لا قيد على قيم القالب');
  // القشرة تفشل مفتوحةً إلى `classic` لا إلى `digital`
  const empty = CHROME.slice(CHROME.indexOf('const EMPTY'));
  assert.ok(/template: 'classic'/.test(empty.slice(0, 600)),
    'القشرة الفارغة لا تعود إلى `classic` — قشرةٌ ناقصة قد تقلب قالب تاجر');
  assert.ok(CHROME.includes("=== 'digital' ? 'digital' : 'classic'"),
    'قراءة القالب لا تتحوّط لقيمة غريبة');
});

test('★★★ رموز الوضع الداكن مقصورة على شجرة القالب الرقمي', () => {
  // كل تعريف رمز داكن يجب أن يكون تحت `[data-nm-digital]`
  const dark = CSS.slice(CSS.indexOf('[data-nm-digital] {'));
  assert.ok(dark.length > 500, 'قسم رموز القالب الرقمي غير موجود');
  assert.ok(dark.includes('--d-bg'), 'رموز القالب الرقمي غير معرَّفة');
  // لا `:root` ولا `html` ولا `body` في قسم القالب الرقمي
  assert.ok(!/:root/.test(dark),
    'رمز داكن معرَّف على :root — يقلب لوحة التحكّم والإدارة معه');
  assert.ok(!/^\s*(html|body)\s*[,{]/m.test(dark),
    'رمز داكن معرَّف على html/body');
  // والاستعلام الداكن مشروط بالحاوية
  assert.ok(dark.includes('[data-nm-digital]:not([data-nm-theme="light"])'),
    'تفضيل النظام غير مقصور على الحاوية');
  assert.ok(dark.includes('[data-nm-digital][data-nm-theme="dark"]'),
    'الاختيار الصريح غير مقصور على الحاوية');
});

test('★★ المتجر العادي لا يقرأ حقول رقمية ولا بنرات في مساره', () => {
  const classicOnly = code('../src/components/storefront/ProductShowcase.tsx');
  assert.ok(!/product_digital_fields/.test(classicOnly),
    'مكوّن المتجر العادي يقرأ حقولًا رقمية');
  assert.ok(!/store_theme_banners/.test(classicOnly),
    'مكوّن المتجر العادي يقرأ بنرات القالب الرقمي');
});

// ═══════════════════════════════════════════════════════════════════
// ٤) التخزين: لا شخصيٌّ في صفحة مشتركة
// ═══════════════════════════════════════════════════════════════════

test('★★★ قشرة القالب الرقمي لا تقرأ كوكيًّا ولا ترويسة', () => {
  for (const [name, src] of [['DigitalChrome', DCHROME]] as const) {
    assert.ok(!/\bcookies\s*\(/.test(src), `${name} يقرأ الكوكيز في التصيير`);
    assert.ok(!/\bheaders\s*\(/.test(src), `${name} يقرأ الترويسات`);
    assert.ok(!/createClient\s*\(\s*\)/.test(src),
      `${name} ينشئ عميلًا بجلسة — يُخرج الصفحة من التخزين`);
  }
});

test('★★★ تفضيل الثيم لا يُخزَّن في كوكي ولا يصل الخادم', () => {
  assert.ok(TOGGLE.includes('localStorage'),
    'التفضيل لا يُحفظ في تخزين المتصفّح');
  assert.ok(!/document\.cookie/.test(TOGGLE), 'التفضيل يُكتب في كوكي');
  assert.ok(!/\bfetch\s*\(/.test(TOGGLE), 'التفضيل يُرسَل إلى الخادم');
  // ولا يُكتب على documentElement فيتسرّب إلى اللوحة
  assert.ok(TOGGLE.includes("querySelector<HTMLElement>('[data-nm-digital]')"),
    'السمة تُكتب خارج شجرة القالب الرقمي');
  assert.ok(!/documentElement/.test(TOGGLE),
    'السمة تُكتب على documentElement — تتسرّب إلى لوحة التحكّم');
});

test('★★ القشرة الرقمية تُبنى من نداء `storeChrome` المخزَّن وحده', () => {
  // لا استعلام جديد لكل قسم: البنرات والتصنيفات وعدّاداتها كلّها
  // داخل نفس الدالّة المخزَّنة
  const load = CHROME.slice(CHROME.indexOf('const load = unstable_cache'));
  assert.ok(load.includes('store_theme_banners'), 'البنرات ليست في القشرة المخزَّنة');
  assert.ok(load.includes('products(count)'), 'عدّاد التصنيفات ليس في القشرة');
  assert.ok(load.includes('storefront_template'), 'القالب ليس في القشرة');
  assert.ok(CHROME.includes('createPublicClient()'),
    'القشرة تستعمل عميلًا بجلسة');
  assert.ok(!/\bcookies\s*\(/.test(CHROME), 'القشرة تقرأ الكوكيز');
});

test('★★ التصنيف الفارغ يُرشَّح عرضًا ولا يُحذف', () => {
  const tiles = code('../src/components/storefront/digital/CategoryTiles.tsx');
  assert.ok(/productCount > 0/.test(tiles),
    'التصنيف الفارغ يُعرض للزبائن');
  // والترشيح عرضٌ لا حذف: لا فعل حذف في مكوّن العرض
  assert.ok(!/delete|removeCategory/.test(tiles),
    'مكوّن العرض يحذف تصنيفًا');
});

// ═══════════════════════════════════════════════════════════════════
// ٥) الأمان: لا ثقة في العميل
// ═══════════════════════════════════════════════════════════════════

test('★★★ لا سعر ولا إجمالي يُرسَل من العميل في المسار الرقمي', () => {
  for (const [name, src] of [['actions', DACTIONS], ['panel', PANEL]] as const) {
    assert.ok(!/p_price|p_total|p_unit_price|p_amount/.test(src),
      `${name} يرسل سعرًا إلى القاعدة`);
  }
  // واللوح يرسل معرّف الباقة لا سعرها
  assert.ok(PANEL.includes('variantId: picked'), 'اللوح لا يرسل معرّف الباقة');
});

test('★★★ المتجر يُشتقّ من المضيف لا من العميل في كل فعل رقمي', () => {
  for (const [name, src] of [['actions', DACTIONS]] as const) {
    assert.ok(src.includes('resolveStoreByHost'),
      `${name} لا يشتقّ المتجر من المضيف`);
    assert.ok(!/storeId:\s*input\.storeId/.test(src),
      `${name} يقبل معرّف المتجر من العميل`);
  }
  // وأفعال اللوحة تمرّ بـ`requireStoreAccess` ثم تستعمل
  // `membership.storeId` لا ما أرسله العميل
  const calls = DASH.match(/p_store_id:\s*[\w.]+/g) ?? [];
  assert.ok(calls.length > 0, 'لا نداءات قاعدة في أفعال اللوحة');
  for (const c of calls) {
    assert.ok(c.includes('membership.storeId'),
      `نداء يمرّر متجرًا غير المُتحقَّق منه: ${c}`);
  }
});

test('★★★ كل فعل لوحة رقمي يمرّ بحارس صلاحية', () => {
  const fns = DASH.match(/export async function (\w+)/g) ?? [];
  assert.ok(fns.length >= 10, 'عدد الأفعال أقلّ من المتوقَّع');
  // كل فعل يكتب يجب أن ينادي requireStoreAccess
  const bodies = DASH.split('export async function ').slice(1);
  for (const b of bodies) {
    const name = b.slice(0, b.indexOf('('));
    if (name === 'listLibrary') continue;   // قراءة عامّة لأصول نشطة
    assert.ok(b.includes('requireStoreAccess('),
      `${name} بلا حارس صلاحية`);
  }
});

test('★★★ رابط زرّ البنر يُتحقَّق منه في القاعدة', () => {
  const at = MIG59.indexOf('function public.save_theme_banner');
  const body = MIG59.slice(at, MIG59.indexOf('$$;', at));
  assert.ok(/\^https:\/\//.test(body), 'https غير مشروط');
  assert.ok(body.includes("v_href ~ '^/"), 'المسار الداخلي غير مشروط');
  assert.ok(body.includes('VALIDATION: رابط الزرّ'), 'لا رفض صريح للرابط الخطأ');
});

test('★★★ لقطة قيم العميل إلحاقية وبلا منح لـanon', () => {
  assert.ok(/order_digital_values_no_update/.test(MIG58), 'لا حارس تعديل');
  assert.ok(/order_digital_values_no_delete/.test(MIG58), 'لا حارس حذف');
  // منح القراءة لـauthenticated وحده
  const grant = MIG58.match(/grant select on public\.order_digital_values to ([^;]+);/);
  assert.ok(grant, 'لا منح قراءة على الجدول');
  assert.ok(!grant![1].includes('anon'),
    'anon يقرأ قيم الطلبات مباشرةً — يجب أن يمرّ بدالّة التوكن');
  // ولا منح كتابة لأيّ دور
  assert.ok(!/grant (insert|update|delete)[^;]*on public\.order_digital_values/
    .test(MIG58), 'منحُ كتابة على لقطة إلحاقية');
});

test('★★★ أصل المكتبة المشترك غير قابل للكتابة من أيّ دور عميل', () => {
  // الدلو: سياسة قراءة فقط
  const bucket = MIG58.slice(MIG58.indexOf('theme_library_read'));
  const chunk = bucket.slice(0, 600);
  assert.ok(/for select to anon, authenticated/.test(chunk),
    'سياسة قراءة الدلو ناقصة');
  assert.ok(!/theme-library[\s\S]{0,400}for (insert|update|delete)/.test(MIG58),
    'سياسة كتابة على دلو المكتبة');
  // و`media_member_write` لم تُمسّ (وهي تشترط store_id not null)
  assert.ok(!/create policy media_member_write/.test(MIG58),
    'سياسة كتابة الوسائط أُعيد تعريفها — قد تفتح الأصل المشترك للتجّار');
  // وتوسيع القراءة مقصور على دلو المكتبة
  const readPolicy = MIG58.slice(MIG58.indexOf('create policy media_public_read'));
  assert.ok(readPolicy.slice(0, 700).includes("bucket = 'theme-library'"),
    'توسيع قراءة الوسائط غير مقصور على دلو المكتبة');
});

test('★★★ لا تنشيط أصل مكتبة بلا ترخيص موثَّق', () => {
  assert.ok(MIG58.includes('platform_media_license_required'),
    'لا قيد يشترط الترخيص');
  assert.ok(/check \(not is_active or coalesce\(trim\(license_note\), ''\) <> ''\)/
    .test(MIG58), 'قيد الترخيص لا يمنع التنشيط بلا مصدر');
});

test('★★★ ربط طلب الزائر: توكن + حدّ معدّل + لا انتزاع', () => {
  const at = MIG59.indexOf('function public.claim_guest_order');
  const body = MIG59.slice(at, MIG59.indexOf('$$;', at));
  assert.ok(body.includes('o.guest_token <> p_guest_token'),
    'الربط لا يتحقّق من التوكن');
  assert.ok(body.includes('check_rate_limit('),
    'الربط بلا حدّ معدّل — يفتح تخمين أرقام الطلبات');
  assert.ok(body.includes('INVALID_CLAIM'), 'لا رفض موحَّد');
  // رسالة واحدة لكل حالات الفشل ⇒ لا تمييز «غير موجود» عن «ليس لك»
  const msgs = body.match(/INVALID_CLAIM: [^']*/g) ?? [];
  assert.ok(new Set(msgs).size === 1,
    'رسائل الرفض مختلفة — تكشف وجود الطلب لمن لا يملكه');
  // ولا يُقبل رقم الطلب وحده
  assert.ok(!/p_phone/.test(body), 'الربط يقبل الهاتف — قابل للتخمين');
});

test('★★★ ولا يُنتزع طلبٌ مربوط بعميل آخر', () => {
  const at = MIG59.indexOf('function public.claim_guest_order');
  const body = MIG59.slice(at, MIG59.indexOf('$$;', at));
  assert.ok(body.includes('o.customer_id is not null'),
    'الربط لا يفحص وجود مالك سابق');
  assert.ok(body.includes('app.current_customer_id(p_store_id)'),
    'الربط لا يقارن بالعميل الحالي');
});

test('★★ المحتوى الابتدائي: مرّة واحدة، وبلا استعادة', () => {
  const at = MIG59.indexOf('function public.seed_digital_starter');
  const body = MIG59.slice(at, MIG59.indexOf('$$;', at));
  // الشرط هو ما يجعلها idempotent: متجرٌ فيه شيءٌ لا يُزرع
  assert.ok(/if exists \(select 1 from public\.products where store_id = p_store_id/
    .test(body), 'لا شرط «متجر خالٍ»');
  assert.ok(body.includes('from public.categories where store_id = p_store_id'),
    'شرط الخلوّ لا يفحص التصنيفات');
  // ولا علَم «زُرِع» يسمح باستعادة المحذوف
  assert.ok(!/seeded_at|starter_seeded_flag|restore/i.test(body),
    'علَمٌ أو استعادة — المحذوف يجب ألا يعود');
  // وتمرّ بـ`save_product` فيسري حدّ الباقة
  assert.ok(body.includes('public.save_product('),
    'الزرع يكتب المنتجات مباشرةً — يتخطّى حدّ الباقة');
  assert.ok(body.includes('p_track_inventory => false'),
    'المنتجات الابتدائية بتتبّع مخزون — وهي رقمية');
  // ولا صورة مرفوعة: لا افتراض حقوق
  assert.ok(!/media_files|product_images/.test(body),
    'الزرع يربط صورًا — ولا نفترض حقوق شعار تجاري');
});

test('★★ الأقسام تُخفى ولا تُرتَّب', () => {
  const at = DASH.indexOf('export async function saveSections');
  const body = DASH.slice(at, DASH.indexOf('export async function', at + 10));
  assert.ok(!/order|sort|sequence/i.test(body.replace(/sortOrder/g, '')),
    'ترتيب الأقسام قابل للحفظ — وهو ليس للتاجر');
  // قائمة بيضاء صريحة للمفاتيح الخمسة
  for (const k of ['hero', 'promo', 'categories', 'featured', 'offers']) {
    assert.ok(body.includes(`${k}:`), `المفتاح ${k} ليس في القائمة البيضاء`);
  }
});

test('★★ إبطال وسم المستأجر عند تغيير القالب أو الإعدادات', () => {
  assert.ok(DASH.includes('tenantTag('),
    'لا إبطال لوسم المستأجر — يبقى التاجر ينتظر دورة تخزين');
  assert.ok(DASH.includes("storeTag(storeId, r)") || DASH.includes('storeTag('),
    'لا إبطال لوسم المتجر');
  const inv = DASH.slice(DASH.indexOf('async function invalidate'));
  assert.ok(inv.slice(0, 400).includes('storeHosts('),
    'الإبطال لا يشمل كل مضيفات المتجر');
});
