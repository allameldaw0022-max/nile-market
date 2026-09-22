import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';

/**
 * بيان المنصة (لوحة التاجر).
 *
 * ★ `start_url` و`scope` على `/dashboard`: التثبيت هنا يخصّ لوحة
 * التاجر، لا واجهة المتجر — لكل متجر بيانه الخاص على دومينه.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${config.siteName} — لوحة التاجر`,
    short_name: config.siteName,
    description: 'إدارة متجرك الإلكتروني: المنتجات والطلبات والعملاء.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'ar',
    dir: 'rtl',
    background_color: '#F5F7FA',
    theme_color: '#0B1F3A',
    categories: ['business', 'shopping', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'الطلبات', url: '/dashboard/orders' },
      { name: 'المنتجات', url: '/dashboard/products' },
      { name: 'منتج جديد', url: '/dashboard/products/new' },
    ],
  };
}
