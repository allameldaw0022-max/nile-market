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

/** خلفيةٌ بيضاء لا لون الثيم: ثيمٌ غامق وشعارٌ غامق = أيقونة عمياء. */
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

type Spec = { size: number; inset: number; fallback: string };

const SPECS: Record<string, Spec> = {
  // مقاسا البيان القياسيان
  '192': { size: 192, inset: 0, fallback: '/icons/icon-192.png' },
  '512': { size: 512, inset: 0, fallback: '/icons/icon-512.png' },
  // iOS: ١٨٠ هو ما يطلبه، وبلا شفافية (الشفاف يصير أسود على الشاشة)
  apple: { size: 180, inset: 0, fallback: '/icons/apple-touch-icon.png' },
  // ★ هامش الأمان ٢٠٪: المشغّل يقصّ الأيقونة بقناعٍ دائري أو مربّعٍ
  //   مستدير، فشعارٌ يملأ الإطار تُقصّ أطرافه.
  maskable: { size: 512, inset: 0.2, fallback: '/icons/maskable-512.png' },
};

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

    const inner = Math.round(wanted.size * (1 - wanted.inset));
    const pad = Math.round((wanted.size - inner) / 2);

    // ★ `contain` لا `cover`: شعارٌ طوليّ (٧٠٩×١٦٠٠ في الإنتاج) يُقصّ
    //   بـ`cover` فيضيع نصفه. الاحتواء يُبقيه كاملًا ويحشو الباقي.
    const png = await sharp(bytes, { limitInputPixels: 50_000_000 })
      .resize(inner, inner, { fit: 'contain', background: BACKGROUND })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: BACKGROUND })
      .flatten({ background: BACKGROUND })
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
