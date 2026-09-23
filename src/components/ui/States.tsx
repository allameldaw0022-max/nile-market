'use client';
import Link from 'next/link';
import { AlertTriangle, Inbox, Lock, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';
import { Button } from './Button';

/** الحالات الموحّدة الإلزامية لكل صفحة (Design System §17.7). */

export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode; title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg
                    border border-dashed border-ink-300 bg-white px-6 py-14 text-center">
      <div className="mb-3 text-ink-400">{icon ?? <Inbox size={36} strokeWidth={1.5} />}</div>
      <h3 className="text-base font-bold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'تعذّر تحميل البيانات', description, onRetry, reference }: {
  title?: string; description?: string; onRetry?: () => void; reference?: string;
}) {
  return (
    <div className="rounded-lg border border-danger/30
                    bg-danger-bg px-6 py-10 text-center">
      <AlertTriangle className="mx-auto mb-3 text-danger" size={32} strokeWidth={1.5} />
      <h3 className="text-base font-bold text-ink-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      {reference && (
        <p className="mt-2 text-xs text-ink-500">
          رقم مرجعي للدعم: <span className="font-mono">{reference}</span>
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5"
                icon={<RefreshCw size={14} />} onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

export function ForbiddenState() {
  return (
    <EmptyState
      icon={<Lock size={36} strokeWidth={1.5} />}
      title="لا تملك صلاحية الوصول"
      description="هذا القسم غير متاح لدورك الحالي. راجع مالك المتجر إن كنت تحتاجه."
    />
  );
}

/** بطاقة الترقية عند بلوغ حد الباقة — لا رسالة خطأ حمراء (§6.6). */
export function UpgradeCard({ message, used, limit }: {
  message: string; used?: number; limit?: number;
}) {
  return (
    <div className="rounded-lg border border-gold-500/40 bg-gold-300/10 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 rounded-full bg-gold-500/20 p-2 text-gold-700">
          <AlertTriangle size={18} />
        </span>
        <div className="flex-1">
          <h3 className="font-bold text-ink-900">وصلت إلى حد باقتك</h3>
          <p className="mt-1 text-sm text-ink-700">{message}</p>
          {used !== undefined && limit !== undefined && (
            <p className="mt-1 text-xs text-ink-500 tabular">
              الاستخدام الحالي: {used} من {limit}
            </p>
          )}
          <Link href="/dashboard/subscription" className="mt-4 inline-block">
            <Button variant="gold" size="sm">ترقية الباقة</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div role="status"
         className="flex items-center justify-center gap-2 bg-ink-900 px-4 py-2
                    text-[13px] font-medium text-white">
      <WifiOff size={14} />
      لا يوجد اتصال — سيُعاد إرسال تغييراتك تلقائيًا عند عودة الشبكة
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="mt-3 h-4 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/3" />
    </div>
  );
}
