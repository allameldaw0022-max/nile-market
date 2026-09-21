import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn(
      'rounded-[--radius-lg] border border-sand-200 bg-white shadow-[--shadow-card]',
      className,
    )}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action }: {
  title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-sand-200 px-5 py-4">
      <div>
        <h2 className="font-bold text-navy-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-sand-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'default' }: {
  label: string; value: string; hint?: string; tone?: 'default' | 'gold';
}) {
  return (
    <Card className="p-4">
      <p className="text-[13px] font-medium text-sand-600">{label}</p>
      <p className={cn('mt-1 text-2xl font-extrabold tabular',
        tone === 'gold' ? 'text-gold-600' : 'text-navy-900')}>{value}</p>
      {hint && <p className="mt-1 text-xs text-sand-600">{hint}</p>}
    </Card>
  );
}
