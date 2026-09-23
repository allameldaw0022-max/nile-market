import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import mark from '@/../public/brand/mark.png';

/**
 * العلامة.
 *
 * ★ الرمز صار ملف العلامة الحقيقي بدل الشكل الهندسي الذي كان نائبًا
 * عنه حتى يصل. يُستورد كوحدة لا كمسار نصّي: Next يعرف عندها أبعاده
 * فيحجز مكانه قبل التحميل ولا تقفز الترويسة (CLS).
 *
 * ★ `priority`: العلامة في أعلى الصفحة وداخل أول شاشة دائمًا، فلا
 * معنى لتأجيل تحميلها.
 *
 * ★ الاسم يبقى نصًّا لا صورة: الشعار الكامل يحمله مرتين (عربيًا
 * ولاتينيًا) وشعارًا، وهو أطول من أن يُقرأ في شريط بارتفاع 64px.
 * والنصّ يُقرأ بقارئ الشاشة ويتبع حجم خطّ المستخدم.
 */
export function Wordmark({ className, tone = 'dark' }: {
  className?: string; tone?: 'dark' | 'light';
}) {
  return (
    <Link href="/" className={cn('inline-flex shrink-0 items-center gap-2.5', className)}>
      <Image
        src={mark}
        alt=""
        aria-hidden
        width={30}
        height={30}
        priority
        // ★ على خلفية داكنة يوضع الرمز على رقعة بيضاء: التركواز
        // (#027B72) على ink-900 تباينه أدنى من أن يُقرأ شكله.
        className={cn('size-[30px] object-contain',
          tone === 'light' && 'rounded-md bg-white p-0.5')}
      />
      <span className={cn('text-[17px] font-bold tracking-tight',
        tone === 'light' ? 'text-white' : 'text-ink-900')}>
        سوق النيل
      </span>
    </Link>
  );
}
