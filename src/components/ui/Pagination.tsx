import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * ترقيم الصفحات — RTL حقيقي.
 *
 * ★ الأيقونة الاتجاهية تُقلب: «السابق» في واجهة عربية يشير يمينًا.
 * استخدام chevron-left لـ«السابق» كما في الواجهات اللاتينية خطأ
 * اتجاهي شائع يجعل المستخدم يضغط عكس ما يريد.
 */
export function Pagination({ page, pages, hrefFor, className }: {
  page: number; pages: number; hrefFor: (p: number) => string; className?: string;
}) {
  if (pages <= 1) return null;
  const prev = page > 1 ? hrefFor(page - 1) : null;
  const next = page < pages ? hrefFor(page + 1) : null;
  const base = 'inline-flex h-10 items-center gap-1.5 rounded-md border px-3.5 text-sm font-medium';

  return (
    <nav aria-label="ترقيم الصفحات" className={cn('flex items-center justify-between gap-3', className)}>
      {prev
        ? <Link href={prev} rel="prev" className={cn(base, 'border-ink-200 bg-white text-ink-900 hover:border-teal-600 hover:text-teal-700')}>
            <ChevronRight size={16} aria-hidden />السابق
          </Link>
        : <span className={cn(base, 'border-ink-100 bg-ink-50 text-ink-400')} aria-disabled>
            <ChevronRight size={16} aria-hidden />السابق
          </span>}

      <p className="text-[13px] text-ink-500">
        صفحة <span className="font-semibold tabular text-ink-900">{page}</span>
        {' '}من <span className="tabular">{pages}</span>
      </p>

      {next
        ? <Link href={next} rel="next" className={cn(base, 'border-ink-200 bg-white text-ink-900 hover:border-teal-600 hover:text-teal-700')}>
            التالي<ChevronLeft size={16} aria-hidden />
          </Link>
        : <span className={cn(base, 'border-ink-100 bg-ink-50 text-ink-400')} aria-disabled>
            التالي<ChevronLeft size={16} aria-hidden />
          </span>}
    </nav>
  );
}
