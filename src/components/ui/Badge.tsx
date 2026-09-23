import { cn } from '@/lib/cn';
import type { StatusTone } from '@/lib/status';
import type { ReactNode } from 'react';

const TONES: Record<StatusTone, string> = {
  neutral: 'bg-ink-100 text-ink-700 border-ink-200',
  info:    'bg-teal-50 text-teal-700 border-teal-200',
  success: 'bg-success-bg text-success border-success/25',
  warning: 'bg-warning-bg text-gold-700 border-gold-500/30',
  danger:  'bg-danger-bg text-danger border-danger/25',
  gold:    'bg-gold-300/15 text-gold-700 border-gold-500/30',
};

/**
 * الحالة لا تُنقل باللون وحده — دائمًا نص، وأيقونة عند الحاجة
 * (دعم عمى الألوان · §17.1).
 */
export function Badge({ tone = 'neutral', icon, children, className }: {
  tone?: StatusTone; icon?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5',
      'text-xs font-bold whitespace-nowrap', TONES[tone], className,
    )}>
      {icon}
      {children}
    </span>
  );
}

export function StatusChip({ map, value }: {
  map: Record<string, { label: string; tone: StatusTone }>; value: string;
}) {
  const s = map[value] ?? { label: value, tone: 'neutral' as StatusTone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
