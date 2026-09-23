import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * العلامة النصّية.
 *
 * ★ ليست أيقونة جاهزة داخل مربّع ملوّن: الرمز شكل هندسي مرسوم —
 * موجتا نهر بين ضفّتين — يقرأه الذهن كنهر لا كأيقونة متجر عامّة
 * مأخوذة من مكتبة. والاسم بجانبه بوزن 700 لا 800 حتى لا يطغى على
 * عنوان الصفحة في الشريط.
 */
export function Wordmark({ className, tone = 'dark' }: {
  className?: string; tone?: 'dark' | 'light';
}) {
  return (
    <Link href="/" className={cn('inline-flex shrink-0 items-center gap-2.5', className)}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden
           className={tone === 'light' ? 'text-white' : 'text-teal-600'}>
        <rect width="28" height="28" rx="7" fill="currentColor" />
        <path d="M6.5 11.5c2.2-1.6 4-1.6 6.2 0s4 1.6 6.2 0M6.5 16.5c2.2-1.6 4-1.6 6.2 0s4 1.6 6.2 0"
              stroke="white" strokeWidth="1.9" strokeLinecap="round" fill="none" />
      </svg>
      <span className={cn('text-[17px] font-bold tracking-tight',
        tone === 'light' ? 'text-white' : 'text-ink-900')}>
        سوق النيل
      </span>
    </Link>
  );
}
