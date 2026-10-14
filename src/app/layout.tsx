import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import './globals.css';
import { config } from '@/lib/config';

/**
 * ★★★ وزنان لا أربعة — بقياسٍ لا بذوق.
 *
 * عُدَّت حروف صفحتَي المتجر والرئيسية على الإنتاج: **٩٩٪ من النصّ
 * بوزن 400**، والأوزان الثلاثة الأخرى مجتمعةً تخدم ~١٪ (بضع مئات من
 * الحروف: عناوين وتسميات وأزرار). وكنّا نحمّل لأجلها ثمانية ملفات
 * خطّ — ١٩٤ ك.ب، أكبر بند في الصفحة كلّها — على شبكة هاتفٍ سودانية.
 *
 * ★★ والهرمية لا تسقط: المتصفّح يُطابق الوزن المفقود بأقرب موجود وفق
 * قاعدة CSS — 500 يُرسم بـ400 (أدنى أوّلًا)، و600 يُرسم بـ700 (أعلى
 * أوّلًا). فيبقى الفرق بين النصّ والعناوين قائمًا، ويُفقد تدريجٌ
 * واحد في ١٪ من الحروف مقابل ٩٤ ك.ب.
 *
 * ★ العائلة ثابتة لا متغيّرة (تحقّقت من بيانات next/font)، فلا سبيل
 *   لملفٍّ واحد يغطّي المدى.
 * ★ العودة إلى أربعة أوزان سطرٌ واحد أدناه إن لزم.
 * `display: swap` يمنع FOIT.
 */
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: '--font-plex-arabic',
  subsets: ['arabic', 'latin'],
  weight: ['400', '700'],
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
