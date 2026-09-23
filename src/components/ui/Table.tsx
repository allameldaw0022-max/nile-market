import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

/**
 * جدول بيانات — RTL حقيقي.
 *
 * ★ المحاذاة تتبع نوع البيانات لا الاتجاه: النصّ العربي يبدأ من
 * اليمين (`text-start`)، والأرقام والمبالغ تُحاذى يسارًا
 * (`text-end`) بعرض ثابت حتى تصطفّ الخانات العشرية عموديًا. هذا
 * ما يجعل عمود المبالغ قابلًا للمسح بالعين بدل قراءته رقمًا رقمًا.
 *
 * ★ على الهاتف يلتفّ الجدول في حاوية تمرير أفقي مع `tabindex` حتى
 * يصله مستخدم لوحة المفاتيح — جدول يمرّر بالفأرة وحدها ليس متاحًا.
 */
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-ink-200 bg-white
                 focus-visible:outline-2 focus-visible:outline-teal-600"
    >
      <table className="w-full min-w-[34rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ numeric, className, children }: {
  numeric?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <th scope="col" className={cn(
      'whitespace-nowrap border-b border-ink-200 bg-ink-50 px-4 py-3',
      'text-[12px] font-semibold uppercase tracking-wide text-ink-500',
      numeric ? 'text-end' : 'text-start', className,
    )}>{children}</th>
  );
}

export function Td({ numeric, className, children }: {
  numeric?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <td className={cn(
      'border-b border-ink-100 px-4 py-3 align-middle text-ink-900',
      numeric ? 'text-end tabular' : 'text-start', className,
    )}>{children}</td>
  );
}

export function Tr({ className, children }: { className?: string; children: ReactNode }) {
  return <tr className={cn('transition-colors hover:bg-ink-50', className)}>{children}</tr>;
}
