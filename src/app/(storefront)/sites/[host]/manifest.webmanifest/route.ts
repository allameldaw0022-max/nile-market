import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';

/**
 * بيان المتجر — واحد لكل مستأجر.
 *
 * ★ اسم التطبيق ولونه من إعدادات المتجر نفسه: الزبون يثبّت «متجر
 * فلان» لا «سوق النيل». التسمية الموحّدة كانت ستضيّع هوية التاجر.
 *
 * ★ لا يُبنى ثابتًا: الاسم والشعار يتغيّران من لوحة التاجر.
 */
export const dynamic = 'force-dynamic';

const THEME_FALLBACK = '#17191C';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ host: string }> },
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store || store.status !== 'active') {
    return new Response('Not found', { status: 404 });
  }

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('store_settings').select('theme')
    .eq('store_id', store.storeId).maybeSingle();

  const theme = (settings?.theme ?? {}) as Record<string, unknown>;
  const themeColor = typeof theme.primary === 'string'
    && /^#[0-9a-fA-F]{6}$/.test(theme.primary) ? theme.primary : THEME_FALLBACK;

  // ★★★ الأيقونات من مسار المتجر لا من ملف الشعار مباشرة:
  //
  //   • كان البيان يرسل الشعار كما هو بإعلان
  //     `sizes: '512x512', type: 'image/png'` — وكلّ شعارات الإنتاج
  //     `image/webp` بمقاسات متفرّقة (١٦٠٠×١٦٠٠ · ٦١٩×٦٠٤ · ٧٠٩×١٦٠٠
  //     · ٤٠٠×٤٠٠). فالإعلان كاذبٌ في النوع والمقاس: كروم قد يتخطّى
  //     أيقونةً لا تطابقه، وشعارٌ طوليّ معلَنٌ مربّعًا يُسحق، وشعارٌ
  //     أصغر من المعلَن يسقط من فحص الحدّ الأدنى للتثبيت.
  //   • و`maskable` كانت **من أيقونات المنصّة**، ومعظم مشغّلات أندرويد
  //     تُفضّلها ⇒ يثبّت الزبون المتجر فيرى علامة «سوق النيل».
  //
  //   والمسار يولّد PNG مربّعًا بالمقاس المطلوب فعلًا، وينحدر إلى
  //   أيقونة المنصّة وحده حين لا شعار.
  const icons = [
    { src: '/store-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/store-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/store-icon/maskable', sizes: '512x512',
      type: 'image/png', purpose: 'maskable' },
  ];

  return Response.json({
    name: store.name,
    short_name: store.name.slice(0, 12),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'ar',
    dir: 'rtl',
    background_color: '#F7F8F9',
    theme_color: themeColor,
    icons,
  }, {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}
