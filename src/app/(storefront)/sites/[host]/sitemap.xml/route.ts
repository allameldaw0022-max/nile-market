import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';

/**
 * خريطة موقع المتجر.
 *
 * ★ تُبنى من الدومين الأساسي دائمًا (`primaryHost`)، حتى لو طُلبت من
 * دومين بديل: خريطة تشير إلى نسختين من الصفحة نفسها تُقسّم ترتيبها.
 *
 * ★ لا صفحات خاصة هنا: السلة والدفع وتتبّع الطلب لا تُفهرس أصلًا.
 *
 * ★ الحد 5000 رابط للملف الواحد (الحد الرسمي 50 ألفًا، ونُبقي هامشًا):
 * متجر يتجاوزه يحتاج خريطة مفهرسة، ولا متجر لدينا يقاربه اليوم.
 */
export const dynamic = 'force-dynamic';

const LIMIT = 5000;

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

type Entry = { path: string; lastmod?: string | null; priority: string; freq: string };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ host: string }> },
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store || store.status !== 'active') {
    return new Response('Not found', { status: 404 });
  }

  const base = `https://${store.primaryHost}`;
  const supabase = await createClient();

  const [products, categories, settings] = await Promise.all([
    supabase.from('products')
      .select('slug, updated_at')
      .eq('store_id', store.storeId).eq('status', 'active').is('deleted_at', null)
      .order('updated_at', { ascending: false }).limit(LIMIT),
    supabase.from('categories')
      .select('slug, updated_at')
      .eq('store_id', store.storeId).eq('is_active', true)
      .order('updated_at', { ascending: false }).limit(500),
    supabase.from('store_settings')
      .select('policies, updated_at')
      .eq('store_id', store.storeId).maybeSingle(),
  ]);

  const entries: Entry[] = [
    { path: '/', priority: '1.0', freq: 'daily' },
    { path: '/products', priority: '0.9', freq: 'daily' },
  ];

  for (const c of categories.data ?? []) {
    entries.push({ path: `/categories/${c.slug}`, lastmod: c.updated_at,
                   priority: '0.7', freq: 'weekly' });
  }
  for (const p of products.data ?? []) {
    entries.push({ path: `/products/${p.slug}`, lastmod: p.updated_at,
                   priority: '0.8', freq: 'weekly' });
  }
  // صفحات السياسات تُدرَج حين كتبها التاجر فقط — صفحة فارغة في
  // الخريطة تُفهرَس ثم تُصنَّف محتوًى ضعيفًا
  const policies = (settings.data?.policies ?? {}) as Record<string, string | undefined>;
  for (const key of ['shipping', 'returns', 'privacy', 'terms'] as const) {
    if (!(policies[key] ?? '').trim()) continue;
    entries.push({ path: `/pages/${key}`, lastmod: settings.data?.updated_at,
                   priority: '0.4', freq: 'monthly' });
  }
  entries.push({ path: '/contact', priority: '0.5', freq: 'monthly' });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url>
    <loc>${escape(base + e.path)}</loc>${e.lastmod
      ? `\n    <lastmod>${new Date(e.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}
    <changefreq>${e.freq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
