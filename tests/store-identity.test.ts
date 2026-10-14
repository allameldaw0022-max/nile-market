import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');

/**
 * ═══════════════════════════════════════════════════════════════════
 * المتجر يُثبَّت بهوية التاجر لا بهوية المنصّة.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ★★★ العطل: زبونُ التاجر يثبّت المتجر على شاشته فيرى أيقونة «سوق
 * النيل». ثلاثة مواضع مجتمعة:
 *   • iOS يتجاهل `manifest` ويقرأ `apple-touch-icon` وحده — وكان
 *     مكتوبًا بالرقم على أيقونة المنصّة، فكل تثبيتٍ على iPhone خطأ.
 *   • أندرويد: البيان يرسل `maskable` **من أيقونات المنصّة**، ومعظم
 *     المشغّلات تُفضّلها على `any`.
 *   • و`favicon` في التبويب كذلك.
 *
 * ★★ ورابعٌ أخفى: البيان كان يُعلن شعار التاجر
 * `sizes: '512x512', type: 'image/png'` — وكل شعارات الإنتاج WebP
 * بمقاسات متفرّقة (٧٠٩×١٦٠٠ · ٦١٩×٦٠٤ · ٤٠٠×٤٠٠). إعلانٌ كاذبٌ في
 * النوع والمقاس: كروم قد يتخطّى الأيقونة، والطوليّ يُسحق، والأصغر من
 * المعلَن يسقط من فحص الحدّ الأدنى للتثبيت.
 */

const LAYOUT = 'src/app/(storefront)/sites/[host]/layout.tsx';
const MANIFEST = 'src/app/(storefront)/sites/[host]/manifest.webmanifest/route.ts';
const ICON_ROUTE = 'src/app/(storefront)/sites/[host]/store-icon/[spec]/route.ts';

test('★★★ أيقونات صفحة المتجر من مسار المتجر لا من أصول المنصّة', () => {
  const layout = read(LAYOUT);
  const icons = /icons:\s*\{[\s\S]*?\n    \},/.exec(layout);
  assert.ok(icons, 'لم يُعثر على كتلة `icons` في تخطيط المتجر');
  assert.ok(!/\/icons\//.test(icons[0]),
    'أيقونة من أصول المنصّة مكتوبةٌ بالرقم — كل تثبيت يُظهر «سوق النيل»');
  assert.match(icons[0], /apple:[\s\S]*?\/store-icon\//,
    '`apple` لا تشير إلى أيقونة المتجر — وهي الوحيدة التي يقرؤها iOS');
  assert.match(icons[0], /icon:[\s\S]*?\/store-icon\//,
    'أيقونة التبويب ليست أيقونة المتجر');
});

test('★★★ وبيان المتجر لا يُعلن أيقونةً لا يملكها', () => {
  const manifest = read(MANIFEST);
  const block = /const icons = \[[\s\S]*?\];/.exec(manifest);
  assert.ok(block, 'لم يُعثر على أيقونات البيان');

  const sources = [...block[0].matchAll(/src:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(sources.length >= 3, `أيقونات البيان ${sources.length} — أقلّ مما يلزم`);
  for (const src of sources) {
    assert.ok(src.startsWith('/store-icon/'),
      `«${src}» ليست من مسار المتجر: إمّا أيقونة منصّة، أو ملفُّ التاجر ` +
      'بإعلان نوعٍ ومقاسٍ لا يطابقانه');
  }
  assert.match(block[0], /purpose: 'maskable'/,
    'لا أيقونة قابلة للقناع — أندرويد سيقصّ شعار التاجر أو يستبدله');
});

test('★★★ ومسار الأيقونة يمرّ بالـproxy — اللاحقة تُسقطه في 404', () => {
  // ★ فخٌّ حقيقيّ: مُطابِق الـproxy يستثني `icons/` وكلّ ما ينتهي
  //   بامتداد صورة. فمسارٌ اسمه `/store-icon/192.png` **لا يُعاد
  //   كتابته** إلى `/sites/[host]` فيعود 404 — والأيقونة تختفي بصمت.
  //   الحارس يشغّل المُطابِق نفسه على المسارات الفعلية.
  const proxy = read('src/proxy.ts');
  const matcher = /matcher:\s*\[\s*(?:\/\/[^\n]*\n\s*)*'([^']+)'/.exec(proxy);
  assert.ok(matcher, 'لم يُقرأ مُطابِق الـproxy');
  const re = new RegExp(`^${matcher[1]}$`);

  const route = read(ICON_ROUTE);
  const specs = [...route.matchAll(/^\s*'?([a-z0-9]+)'?:\s*\{ size:/gim)]
    .map((m) => m[1]);
  assert.ok(specs.length >= 4, `قُرئت ${specs.length} صيغ — المطابِق انكسر`);

  for (const spec of specs) {
    assert.ok(re.test(`/store-icon/${spec}`),
      `/store-icon/${spec} مستثنًى من الـproxy ⇒ 404 ولا أيقونة`);
  }
  // وأصول المنصّة تبقى مستثناة: هي بديلُنا حين لا شعار، وتُخدَم ثابتةً.
  assert.ok(!re.test('/icons/icon-192.png'),
    'أصول المنصّة لم تعد مستثناة — البديل سيمرّ بالـproxy بلا داعٍ');
});

test('★★ والأيقونة تُولَّد مربّعةً بلا شفافية — لا تُخدَم كما رُفعت', () => {
  const route = read(ICON_ROUTE);
  assert.match(route, /fit: 'contain'/,
    'بلا `contain` يُقصّ شعارٌ طوليّ (٧٠٩×١٦٠٠ في الإنتاج) فيضيع نصفه');
  assert.match(route, /\.flatten\(/,
    'بلا تسطيحٍ تصير الشفافية سوداء على شاشة iPhone');
  assert.match(route, /\.png\(/, 'الخرج ليس PNG — وهو ما يُعلنه البيان');
  assert.match(route, /inset: 0\.2/,
    'لا هامش أمان للأيقونة القابلة للقناع — المشغّل يقصّ أطراف الشعار');
  assert.match(route, /limitInputPixels/,
    'بلا حدٍّ لأبعاد المدخل: صورةٌ ضخمة تستنزف ذاكرة الدالّة');
});

test('★★ ومتجرٌ بلا شعار ينحدر إلى أيقونة المنصّة لا إلى لا شيء', () => {
  // أيقونةٌ مفقودة تمنع التثبيت أصلًا — وهذا أسوأ من أيقونةٍ ليست له.
  const route = read(ICON_ROUTE);
  assert.match(route, /if \(!logo\) return Response\.redirect/,
    'لا بديل حين لا شعار — التثبيت يسقط');
  assert.match(route, /log\.error\('store_icon_failed'/,
    'فشل التوليد يُبتلع بلا أثر (قاعدة ٨) — شعارٌ لا يُفكّ يراه كل زبون');
});
