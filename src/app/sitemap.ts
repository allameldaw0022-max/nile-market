import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';

/**
 * خريطة موقع المنصة — الصفحات العامة وحدها.
 *
 * ★ متاجر المستأجرين ليست هنا: لكل متجر خريطته على دومينه، ودمجها
 * يخلط سلطة الدومينات ويربك الفهرسة.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = config.siteUrl.replace(/\/$/, '');
  const now = new Date();

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/login`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: 'yearly', priority: 0.6 },
  ];
}
