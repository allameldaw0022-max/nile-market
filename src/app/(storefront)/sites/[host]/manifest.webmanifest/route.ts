import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';
import { publicUrl } from '@/lib/media/url';

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

  const { data: logo } = await supabase
    .from('media_files').select('bucket, path')
    .eq('store_id', store.storeId).eq('purpose', 'store_logo')
    .eq('status', 'ready').is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  // شعار المتجر أيقونةً حين وُجد، وأيقونة المنصة احتياطًا — متجر بلا
  // أيقونة لا يُثبَّت على الشاشة الرئيسية.
  const logoUrl = logo ? publicUrl(logo.bucket, logo.path) : null;
  const icons = logoUrl
    ? [{ src: logoUrl, sizes: '512x512', type: 'image/png', purpose: 'any' },
       { src: '/icons/maskable-512.png', sizes: '512x512',
         type: 'image/png', purpose: 'maskable' }]
    : [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
       { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
       { src: '/icons/maskable-512.png', sizes: '512x512',
         type: 'image/png', purpose: 'maskable' }];

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
