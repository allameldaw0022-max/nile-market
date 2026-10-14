import sharp from 'sharp';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { storeChrome } from '@/lib/tenant/chrome';
import { log } from '@/lib/observability/logger';

/**
 * أيقونة المتجر — شعار التاجر مربّعًا بالمقاس الذي يطلبه النظام.
 *
 * ★★★ العطل الذي يُصلحه: زبونُ التاجر يثبّت المتجر على شاشته فيرى
 * أيقونة **سوق النيل** لا لوجو متجره. ثلاثة أسباب مجتمعة:
 *
 *   • iOS يتجاهل `manifest` ويقرأ `<link rel="apple-touch-icon">`
 *     وحده — وكان مكتوبًا بالرقم على أيقونة المنصّة في `layout.tsx`.
 *   • Android: البيان كان يرسل شعار التاجر بـ`purpose: any` ومعه
 *     `maskable` **من أيقونات المنصّة**، ومعظم المشغّلات الحديثة
 *     تُفضّل `maskable` ⇒ تظهر علامة المنصّة.
 *   • و`favicon` في تبويب المتصفّح كان أيقونة المنصّة كذلك.
 *
 * ★★ وعلّةٌ رابعة: البيان كان يُعلن شعار التاجر
 * `sizes: '512x512', type: 'image/png'` — و**كل** شعارات الإنتاج
 * الأربعة عشر `image/webp`، ومقاساتها متفرّقة (١٦٠٠×١٦٠٠ · ٦١٩×٦٠٤ ·
 * ٧٠٩×١٦٠٠ · ٤٠٠×٤٠٠). فالإعلان كاذبٌ في النوع والمقاس: كروم قد
 * يتخطّى أيقونةً لا تطابق إعلانها، وشعارٌ طوليّ معلَنٌ مربّعًا يُسحق،
 * وشعارٌ أصغر من المعلَن يسقط من فحص الحدّ الأدنى للتثبيت.
 *
 * فالعلاج أن تُولَّد الأيقونة فعلًا: مربّعة · PNG · بالمقاس المطلوب ·
 * وبهامش أمان للنسخة القابلة للقناع. لا إعلانٌ عن شيء لا نملكه.
 *
 * ★ لمَ لا `next/og`: Satori لا يفكّ WebP، وكل شعارات الإنتاج WebP.
 * ★ ولمَ المسار بلا لاحقة `.png`: مُطابِق الـproxy يستثني كل ما ينتهي
 *   بامتداد صورة ويستثني `icons/` — فمسارٌ بلاحقة لا يُعاد كتابته إلى
 *   `/sites/[host]` ويعود 404. (و`/icons/*` تبقى أصولًا ثابتة للمنصّة
 *   وهي بديلُنا حين لا شعار.)
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** أبيضُ احتياطيّ حين لا تُعرف خلفية الشعار. */
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

type Spec = { size: number; fallback: string; maskable?: true };

const SPECS: Record<string, Spec> = {
  // مقاسا البيان القياسيان
  '192': { size: 192, fallback: '/icons/icon-192.png' },
  '512': { size: 512, fallback: '/icons/icon-512.png' },
  // iOS: ١٨٠ هو ما يطلبه، وبلا شفافية (الشفاف يصير أسود على الشاشة)
  apple: { size: 180, fallback: '/icons/apple-touch-icon.png' },
  maskable: { size: 512, fallback: '/icons/maskable-512.png', maskable: true },
};

/**
 * لون خلفية الشعار — من حوافّه الأربع.
 *
 * ★★★ لماذا لا الأبيض دائمًا: شعارُ تاجرٍ حقيقيّ في الإنتاج مربّعٌ
 * **أسود يملأ إطاره**. فحشوُه بأبيض يصنع إطارًا أبيض حول مربّع أسود،
 * ثم يُصغّره المشغّل داخل مربّعه هو ⇒ شعارٌ صغير في وسط بياض — وهو
 * بالضبط ما اشتكى منه صاحب المنصّة في لقطة الشاشة.
 *
 * والحلّ أن يُحشى بلون الشعار نفسه: شعارٌ مربّع لا يُحشى أصلًا، وشعارٌ
 * مستطيل يمتدّ لونه إلى الحواف فيبدو مقصودًا لا مقصوصًا.
 */
async function backdrop(bytes: Buffer): Promise<typeof WHITE> {
  const { width = 0, height = 0, hasAlpha } = await sharp(bytes).metadata();
  // ★ شعارٌ بشفافية مارِكٌ عارٍ لا بطاقة: خلفيته بيضاء وله هامش أمان.
  if (hasAlpha || !width || !height) return WHITE;

  const band = Math.max(2, Math.round(Math.min(width, height) * 0.04));
  const regions = [
    { left: 0, top: 0, width, height: band },
    { left: 0, top: height - band, width, height: band },
    { left: 0, top: 0, width: band, height },
    { left: width - band, top: 0, width: band, height },
  ];

  let r = 0, g = 0, b = 0;
  for (const region of regions) {
    const { channels } = await sharp(bytes).extract(region).stats();
    r += channels[0].mean; g += channels[1].mean; b += channels[2].mean;
  }
  const n = regions.length;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), alpha: 1 };
}

const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ host: string; spec: string }> },
) {
  const { host, spec } = await params;
  const wanted = SPECS[spec];
  if (!wanted) return new Response('Not found', { status: 404 });

  const store = await resolveStoreByHost(host);
  if (!store) return new Response('Not found', { status: 404 });

  // ★★★ الشعار **المختار** (`stores.logo_url`) لا أحدث ملفٍ مرفوع:
  //   `BankAccountsForm` يرفع **شعار البنك** بنفس الغرض
  //   (`purpose: 'store_logo'`)، فاستعلام «الأحدث» كان يعطي شعار بنكٍ
  //   أيقونةً للمتجر. مُثبَت على الإنتاج: متجران من أربعة عشر أحدثُ
  //   ملفٍ لهما ليس شعارهما المختار، وهما المتجران اللذان لهما حسابات
  //   بنكية. و`storeChrome` هي مصدر الشعار نفسه الذي يعرضه رأس المتجر،
  //   فالأيقونة والرأس لا يفترقان.
  const chrome = await storeChrome(store.storeId);

  // ★ متجرٌ بلا شعار يأخذ أيقونة المنصّة: أيقونةٌ مفقودة تمنع التثبيت
  //   أصلًا، وهذا أسوأ من أيقونةٍ ليست له.
  if (!chrome.logoUrl) {
    return Response.redirect(new URL(wanted.fallback, _request.url), 307);
  }

  // ★ ولا يُجلب إلا من دلو هذا المشروع: الرابط مُحقَّقٌ عند الكتابة
  //   (`cleanPublicUrl`)، وهذا الفحص الثاني يمنع أن يصير المسار بوّابة
  //   جلبٍ لأي عنوان لو تسرّب رابطٌ خارجيّ إلى العمود يومًا.
  const allowed = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/`;
  if (!allowed.startsWith('https://') || !chrome.logoUrl.startsWith(allowed)) {
    log.error('store_icon_foreign_logo', { store_id: store.storeId, spec });
    return Response.redirect(new URL(wanted.fallback, _request.url), 307);
  }

  try {
    const source = await fetch(chrome.logoUrl, { cache: 'no-store' });
    if (!source.ok) throw new Error(`storage ${source.status}`);
    const bytes = Buffer.from(await source.arrayBuffer());

    const background = await backdrop(bytes);

    // ★★ هامش الأمان للأيقونة القابلة للقناع **فقط** حين يكون الشعار
    //    مارِكًا بشفافية: المشغّل يقصّ أطراف الإطار، فمارِكٌ بلا هامش
    //    تُقصّ حوافّه. أمّا بطاقةٌ معتمة لها خلفيتها فتملأ الإطار
    //    كما هي — والمقصوص منها خلفيتها لا شعارها.
    const inset = wanted.maskable && background === WHITE ? 0.2 : 0;
    const inner = Math.round(wanted.size * (1 - inset));
    const pad = Math.round((wanted.size - inner) / 2);

    // ★ `contain` لا `cover`: شعارٌ طوليّ (٧٠٩×١٦٠٠ في الإنتاج) يُقصّ
    //   بـ`cover` فيضيع نصفه. الاحتواء يُبقيه كاملًا، ويُحشى الباقي
    //   بلون حوافّه فيمتدّ إلى أطراف الأيقونة.
    const png = await sharp(bytes, { limitInputPixels: 50_000_000 })
      .resize(inner, inner, { fit: 'contain', background })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background })
      .flatten({ background })
      .png({ compressionLevel: 9 })
      .toBuffer();

    return new Response(new Uint8Array(png), {
      headers: { 'content-type': 'image/png', 'cache-control': CACHE },
    });
  } catch (err) {
    // ★ الفشل يُغلق على أيقونة المنصّة لا على أيقونةٍ مكسورة — لكنه
    //   **لا يصمت** (قاعدة ٨): شعارٌ لا يُفكّ عطلٌ يراه كل زبون.
    log.error('store_icon_failed', {
      store_id: store.storeId,
      spec,
      reason: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
    });
    return Response.redirect(new URL(wanted.fallback, _request.url), 307);
  }
}
