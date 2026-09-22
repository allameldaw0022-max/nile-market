import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

/**
 * ★ البطاقة بلا ظلّ افتراضًا. الهرمية تُبنى بالحدّ والمسافة والتباين
 * لا بالظلال — الظلّ على كل سطح يجعل الصفحة ضبابية ويُلغي معناه:
 * إن كان كل شيء مرفوعًا فلا شيء مرفوع. الظلّ محجوز لما يطفو فعلًا
 * فوق المحتوى (قائمة منسدلة · حوار).
 */
export function Card({ as: Tag = 'div', className, children }: {
  as?: 'div' | 'section' | 'article' | 'li';
  className?: string; children: ReactNode;
}) {
  return (
    <Tag className={cn('rounded-[--radius-lg] border border-ink-200 bg-white', className)}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, action, as: Tag = 'h2' }: {
  title: string; description?: string; action?: ReactNode;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
      <div className="min-w-0">
        <Tag className="text-[15px] font-semibold text-ink-900">{title}</Tag>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * مؤشّر رقمي. الرقم هو البطل بصريًا — التسمية فوقه صغيرة هادئة،
 * والدلالة (ارتفاع/انخفاض) نصّ لا لون وحده.
 */
export function StatCard({ label, value, hint, trend, tone = 'default' }: {
  label: string; value: string; hint?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string };
  tone?: 'default' | 'gold';
}) {
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-[13px] font-medium text-ink-500">{label}</p>
      <p className={cn('mt-1.5 text-[26px] font-bold leading-none tabular',
        tone === 'gold' ? 'text-gold-700' : 'text-ink-900')}>{value}</p>
      {trend && (
        <p className={cn('mt-2 text-xs font-medium',
          trend.direction === 'up' ? 'text-[--color-success]'
          : trend.direction === 'down' ? 'text-[--color-danger]' : 'text-ink-500')}>
          {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '—'}{' '}
          {trend.label}
        </p>
      )}
      {hint && <p className="mt-2 text-xs text-ink-500">{hint}</p>}
    </Card>
  );
}
