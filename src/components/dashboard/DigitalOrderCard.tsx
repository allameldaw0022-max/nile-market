'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { ORDER_STATUS, PAYMENT_STATUS } from '@/lib/status';
import { formatDateTime, formatMoney } from '@/lib/money/format';
import { markDigitalShipped } from '@/lib/digital/dashboard';

export type DigitalOrderCardData = {
  id: string; orderNumber: string; status: string; paymentStatus: string;
  total: number; contactName: string; contactPhone: string; createdAt: string;
  productName: string | null; variantName: string | null;
  digital: { label: string; value: string }[];
};

/**
 * بطاقة الطلب الرقمي في قائمة الطلبات.
 *
 * ★★ كل ما يحتاجه التاجر للتنفيذ **ظاهرٌ في البطاقة**: اللعبة والباقة
 * والسعر ورقم اللاعب وحالة الدفع وحالة الطلب. فلا يفتح التفاصيل
 * لينسخ رقمًا ثم يعود — وهذه هي كلفة التنفيذ الفعلية في متجر رقمي.
 *
 * ★★ وزرّ «تم الشحن» بلا حوار تأكيد (طلبٌ واضح)، لكن **الشرط في
 * القاعدة**: `payment_status = 'paid'` وصلاحية `orders:update`. والزرّ
 * لا يظهر قبل تأكيد الدفع — وإن استُدعي الفعل مباشرةً رُدّ من القاعدة.
 */
export function DigitalOrderCard({ storeId, order, canFulfil }: {
  storeId: string; order: DigitalOrderCardData; canFulfil: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const paid = order.paymentStatus === 'paid';
  const done = order.status === 'completed';
  const cancelled = order.status === 'cancelled';

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href={`/dashboard/orders/${order.id}`}
              className="font-extrabold tabular text-ink-900 hover:text-teal-700"
              dir="ltr">
          {order.orderNumber}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink-900">
            {order.productName ?? order.contactName}
            {order.variantName && (
              <span className="ms-2 rounded bg-teal-50 px-1.5 py-0.5 text-[11px]
                               font-semibold text-teal-700">
                {order.variantName}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-ink-500">
            {order.contactName} · <span dir="ltr" className="tabular">
              {order.contactPhone}
            </span>
          </p>
        </div>
        <span className="text-xs text-ink-500">{formatDateTime(order.createdAt)}</span>
        <span className="font-bold tabular text-ink-900">
          {formatMoney(order.total)}
        </span>
        <StatusChip map={PAYMENT_STATUS} value={order.paymentStatus} />
        <StatusChip map={ORDER_STATUS} value={order.status} />
      </div>

      {/* بيانات الشحن — ظاهرة بلا فتح التفاصيل */}
      {order.digital.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-ink-50
                       px-3 py-2 text-[12.5px]">
          {order.digital.map((d, i) => (
            <div key={`${d.label}-${i}`} className="flex items-baseline gap-1.5">
              <dt className="text-ink-500">{d.label}:</dt>
              <dd className="font-bold tabular text-ink-900" dir="ltr">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {done ? (
          <span className="inline-flex items-center gap-1.5 text-[12.5px]
                           font-semibold text-success">
            <Check size={14} aria-hidden /> نُفِّذ واكتمل
          </span>
        ) : cancelled ? (
          <span className="text-[12.5px] text-ink-500">الطلب ملغى</span>
        ) : paid ? (
          canFulfil && (
            <Button size="sm" loading={pending} icon={<PackageCheck size={15} />}
                    onClick={() => start(async () => {
                      setError(null);
                      const res = await markDigitalShipped({
                        storeId, orderId: order.id,
                      });
                      if (!res.ok) { setError(res.message); return; }
                      router.refresh();
                    })}>
              تم الشحن
            </Button>
          )
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-500">
            <AlertTriangle size={14} aria-hidden style={{ color: '#896F33' }} />
            بانتظار تأكيد الدفع — راجع الإيصال في التفاصيل
          </span>
        )}
        <Link href={`/dashboard/orders/${order.id}`}
              className="text-[12.5px] font-semibold text-ink-500 hover:text-teal-700">
          التفاصيل
        </Link>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-danger">{error}</p>
      )}
    </div>
  );
}
