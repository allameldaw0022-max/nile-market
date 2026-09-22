import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { box: string; icon: string; Icon: typeof Info }> = {
  info:    { box: 'border-teal-200 bg-teal-50',                      icon: 'text-teal-700',            Icon: Info },
  success: { box: 'border-[--color-success]/25 bg-[--color-success-bg]', icon: 'text-[--color-success]', Icon: CheckCircle2 },
  warning: { box: 'border-gold-500/30 bg-[--color-warning-bg]',      icon: 'text-gold-700',            Icon: AlertTriangle },
  danger:  { box: 'border-[--color-danger]/25 bg-[--color-danger-bg]',  icon: 'text-[--color-danger]',  Icon: XCircle },
};

/**
 * ★ الدلالة لا تُنقل باللون وحده: لكل نبرة أيقونة مميّزة ونصّ صريح
 * (§27 · دعم عمى الألوان). و`role` يتبع الخطورة — `alert` يقاطع
 * قارئ الشاشة، و`status` لا يقاطعه، فلا نصرخ على كل رسالة.
 */
export function Alert({ tone = 'info', title, children, className }: {
  tone?: Tone; title?: string; children?: ReactNode; className?: string;
}) {
  const { box, icon, Icon } = TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-[--radius-md] border p-3.5', box, className)}
    >
      <Icon size={18} className={cn('mt-0.5 shrink-0', icon)} aria-hidden />
      <div className="min-w-0 text-sm leading-relaxed">
        {title && <p className="font-semibold text-ink-900">{title}</p>}
        {children && <div className={cn('text-ink-700', title && 'mt-0.5')}>{children}</div>}
      </div>
    </div>
  );
}
