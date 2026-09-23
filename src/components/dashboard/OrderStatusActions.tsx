'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Ban, Check, Package, Truck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { transitionOrder } from '@/app/(dashboard)/dashboard/orders/actions';
import { ORDER_STATUS } from '@/lib/status';

/**
 * الانتقالات المسموحة — نسخة من آلة الحالة في القاعدة لغرض العرض
 * وحده. القاعدة (`app.can_transition_order`) هي الحَكَم، وأي انتقال
 * غير مسموح يُرفض هناك ولو ظهر زره هنا.
 */
const NEXT: Record<string, { to: string; label: string; icon: typeof Check; tone?: 'danger' | 'back' }[]> = {
  new: [
    { to: 'confirmed', label: 'تأكيد الطلب', icon: Check },
    { to: 'cancelled', label: 'إلغاء', icon: Ban, tone: 'danger' },
  ],
  confirmed: [
    { to: 'preparing', label: 'بدء التجهيز', icon: Package },
    { to: 'cancelled', label: 'إلغاء', icon: Ban, tone: 'danger' },
  ],
  preparing: [
    { to: 'shipped', label: 'تم الشحن', icon: Truck },
    { to: 'confirmed', label: 'رجوع للتأكيد', icon: ArrowLeft, tone: 'back' },
    { to: 'cancelled', label: 'إلغاء', icon: Ban, tone: 'danger' },
  ],
  shipped: [
    { to: 'completed', label: 'اكتمل التسليم', icon: Check },
    { to: 'preparing', label: 'رجوع للتجهيز', icon: ArrowLeft, tone: 'back' },
    { to: 'cancelled', label: 'إرجاع وإلغاء', icon: Ban, tone: 'danger' },
  ],
};

export function OrderStatusActions({ storeId, orderId, status }: {
  storeId: string; orderId: string; status: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const options = NEXT[status] ?? [];

  const run = (to: string, why?: string) => start(async () => {
    setError(null);
    const res = await transitionOrder(storeId, orderId, to, why);
    if (!res.ok) { setError(res.message); return; }
    setConfirming(null);
    setReason('');
    router.refresh();
  });

  if (options.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        {ORDER_STATUS[status]?.label ?? status} — لا إجراءات متاحة على هذه الحالة.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border
                        border-danger/30 bg-danger-bg p-3
                        text-sm text-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}
        </p>
      )}

      {confirming === 'cancelled' ? (
        <div className="space-y-3 rounded-md border border-danger/30 p-4">
          <p className="text-sm font-bold text-ink-900">سبب الإلغاء</p>
          <p className="text-xs text-ink-500">
            السبب إلزامي ويُحفظ في سجل الطلب. الكميات المحجوزة تعود للمخزون.
          </p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
                    aria-label="سبب الإلغاء"
                    placeholder="مثال: طلب الزبون الإلغاء" />
          <div className="flex gap-2">
            <Button variant="danger" loading={pending}
                    disabled={reason.trim().length < 3}
                    onClick={() => run('cancelled', reason.trim())}>
              تأكيد الإلغاء
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(null)}>تراجع</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <Button key={opt.to} loading={pending}
                    variant={opt.tone === 'danger' ? 'danger'
                      : opt.tone === 'back' ? 'ghost' : 'primary'}
                    icon={<opt.icon size={15} />}
                    onClick={() => {
                      if (opt.to === 'cancelled') setConfirming('cancelled');
                      else run(opt.to);
                    }}>
              {opt.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
