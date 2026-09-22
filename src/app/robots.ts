import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';

/**
 * robots لدومين المنصة.
 *
 * ★ لوحات التحكم والإدارة والشريك ممنوعة من الزحف: ليست محتوى عامًّا،
 * ووجود مساراتها في نتائج البحث يدلّ عليها بلا فائدة.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard', '/admin', '/partner', '/account', '/support',
        '/api/', '/auth/', '/onboarding', '/invite/', '/sites/',
        '/reset-password', '/verify-email',
      ],
    }],
    sitemap: `${config.siteUrl}/sitemap.xml`,
  };
}
