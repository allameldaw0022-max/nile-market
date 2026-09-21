import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';

const cairo = Cairo({
  variable: '--font-cairo',
  subsets: ['arabic', 'latin'],
  // وزنان فقط + swap ⇒ لا FOIT على الإنترنت الضعيف (§18.4)
  weight: ['400', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'نايل ماركت', template: '%s | نايل ماركت' },
  description: 'منصة إنشاء وإدارة المتاجر الإلكترونية في السودان',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B1F3A',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
