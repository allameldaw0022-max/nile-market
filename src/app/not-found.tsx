import Link from 'next/link';
import type { Metadata } from 'next';
import { buttonClass } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'الصفحة غير موجودة',
  robots: { index: false, follow: false },
};

/**
 * صفحة 404 الموحّدة.
 *
 * ★ الافتراضية في Next إنجليزية وبمحاذاة يسارية داخل موقع عربي
 * كامل، وتظهر لكل رابط قديم أو مكتوب بخطأ. ومسارات المستأجر تصل
 * إليها أيضًا (الـproxy يردّ 404 على مسارات اللوحات فوق نطاق متجر).
 *
 * ★ بلا رابط «لوحة التحكم»: هذه الصفحة تُعرض على نطاق المتجر كما
 * تُعرض على المنصّة، ورابط لوحة لا يملكها الزائر وعدٌ كاذب.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center
                    justify-center px-4 py-16 text-center">
      <p className="font-mono text-5xl font-extrabold text-ink-200">404</p>
      <h1 className="mt-4 text-xl font-extrabold text-ink-900">
        الصفحة غير موجودة
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        الرابط قد يكون قديمًا أو مكتوبًا بخطأ. تأكّد منه أو ارجع إلى الرئيسية.
      </p>
      <Link href="/" className={buttonClass('primary', 'md', 'mt-6')}>
        العودة إلى الرئيسية
      </Link>
    </div>
  );
}
