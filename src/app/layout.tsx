import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import './globals.css';
import { config } from '@/lib/config';

/**
 * ★ أربعة أوزان لا وزنان: الهرمية الطباعية تحتاج تمييزًا بين النصّ
 * (400) والتسميات (500) والعناوين الفرعية (600) والعناوين (700).
 * الوزن 800 مُستثنى — يُستدعى عند الحاجة من نفس العائلة عبر 700
 * المُثقَّل بصريًا، فلا نحمّل ملفًّا خامسًا على شبكة ضعيفة.
 * `display: swap` يمنع FOIT.
 */
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: '--font-plex-arabic',
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const DESCRIPTION =
  'أنشئ متجرك الإلكتروني وأدِر منتجاتك وطلباتك ومخزونك من مكان واحد.';

export const metadata: Metadata = {
  // ★ بدونه تخرج روابط الصور في وسوم OG نسبيةً، وواتساب وفيسبوك لا
  // يحلّانها فتصل الرسالة بلا صورة — وهي أكثر قناة مشاركة هنا.
  metadataBase: new URL(config.siteUrl),
  title: { default: 'سوق النيل', template: '%s | سوق النيل' },
  description: DESCRIPTION,
  applicationName: 'سوق النيل',
  // ★ لا حقل `icons` هنا عمدًا: إعلانه يُلغي التقاط Next التلقائي
  // لملفات `src/app` فيختفي رابط الأيقونة كلّه — تحقّقت من ذلك في
  // الـHTML المُصدَر. الملفات `icon.png` و`apple-icon.png`
  // و`opengraph-image.png` تكفي وحدها، ونسخة `public/icons/` تبقى
  // لأن تخطيط المتجر يشير إليها بمسار ثابت.
  openGraph: {
    type: 'website',
    siteName: 'سوق النيل',
    locale: 'ar_SD',
    title: 'سوق النيل',
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#17191C',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ar" dir="rtl" className={`${plexArabic.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
