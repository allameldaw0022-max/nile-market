'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { markDigitalShipped } from '@/lib/digital/dashboard';

/**
 * تنفيذ الطلب الرقمي من صفحة التفاصيل — نفس الفعل الذي في البطاقة.
 *
 * ★★ لا حوار تأكيد (§٢١): الفعل صريح، والرجوع عنه غير متاح عن قصد —
 * الشحنة نُفِّذت خارج المنصّة فعلًا.
 *
 * ★★ والشرط في القاعدة: `payment_status = 'paid'` وصلاحية `orders:update`.
 * فالزرّ المخفيّ ليس الحاجز، وإخفاؤه تحسين تجربة فقط.
 */
export function DigitalFulfilAction({ storeId, orderId, status, paymentStatus }: {
  storeId: string; orderId: string; status: string; paymentStatus: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === 'completed') {
    return (
      <p className="text-sm font-semibold text-success">
        نُفِّذ الطلب واكتمل.
      </p>
    );
  }
  if (status === 'cancelled') return null;

  if (paymentStatus !== 'paid') {
    return (
      <p className="flex items-start gap-2 rounded-md bg-gold-50 p-3 text-[13px]
                    text-ink-700">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
        لا يمكن التنفيذ قبل تأكيد الدفع. راجع إيصال التحويل أدناه ثم أكّده.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button loading={pending} icon={<PackageCheck size={16} />}
              onClick={() => start(async () => {
                setError(null);
                const res = await markDigitalShipped({ storeId, orderId });
                if (!res.ok) { setError(res.message); return; }
                router.refresh();
              })}>
        تم الشحن
      </Button>
      <p className="text-xs text-ink-500">
        ينتقل الطلب إلى «مكتمل» ويصل الزبون إشعارٌ بذلك.
      </p>
      {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}
