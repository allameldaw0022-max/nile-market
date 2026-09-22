import 'server-only';

/** إعدادات المنصة. كل قيمة سرية تُقرأ هنا فقط، خادميًا. */
export const config = {
  siteName: 'سوق النيل',
  siteNameEn: 'Nile Market',
  rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nilemarket.online',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  currency: 'SDG' as const,
  timezone: 'Africa/Khartoum' as const,
  locale: 'ar' as const,
} as const;

/** المضيفات التي تُعامَل كالمنصة لا كمتجر مستأجر. */
export function isPlatformHost(host: string): boolean {
  const h = host.toLowerCase().split(':')[0];
  return (
    h === config.rootDomain ||
    h === `www.${config.rootDomain}` ||
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.endsWith('.vercel.app')
  );
}
