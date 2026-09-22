import { resolveStoreByHost } from '@/lib/tenant/resolve';

/**
 * robots للمتجر.
 *
 * ★ متجر غير نشط أو دومين بديل ⇒ منع الفهرسة كاملًا: نسخة ثانية من
 * المتجر على دومين آخر تنافس الأصل على نفس الكلمات.
 *
 * ★ مسارات السلة والدفع والحساب ممنوعة: ليست محتوى، وزحفها يستهلك
 * ميزانية الزحف ويُنشئ صفحات فارغة في نتائج البحث.
 */
export const dynamic = 'force-dynamic';

const BLOCKED = [
  '/cart', '/checkout', '/order', '/orders/', '/account',
  '/api/', '/search?', '/offline',
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ host: string }> },
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);

  const disallowAll = !store
    || store.status !== 'active'
    || (store.primaryHost && store.primaryHost !== host.toLowerCase().split(':')[0]);

  const body = disallowAll
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n${BLOCKED.map((p) => `Disallow: ${p}`).join('\n')}\n\n`
      + `Sitemap: https://${store.primaryHost}/sitemap.xml\n`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
