import 'server-only';
import { rootDomain, siteUrl } from '@/lib/partners/links';

/** إعدادات المنصة. كل قيمة سرية تُقرأ هنا فقط، خادميًا. */
export const config = {
  siteName: 'سوق النيل',
  siteNameEn: 'Nile Market',
  // ★ المصدر في `lib/partners/links` لا هنا: ذلك الملف غير خادمي
  // ويحتاجه الـproxy وتحليل الرابط القصير، فالقيمة واحدة للجميع.
  rootDomain: rootDomain(),
  siteUrl: siteUrl(),
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
