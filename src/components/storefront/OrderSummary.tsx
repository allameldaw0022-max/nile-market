import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from '@/lib/status';
import { formatDateTime, formatMoney } from '@/lib/money/format';

export type OrderDetails = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  contactName: string;
  contactPhone: string;
  deliveryZoneName: string | null;
  deliveryAddress: { line?: string; landmark?: string | null };
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  total: number;
  couponCode: string | null;
  note: string | null;
  createdAt: string;
  items: {
    productName: string; variantName: string | null;
    unitPrice: number; quantity: number; lineTotal: number;
  }[];
};

/** عرض طلب واحد للزبون — نفس المكوّن في صفحة التأكيد وصفحة التتبّع. */
export function OrderSummary({ order }: { order: OrderDetails }) {
  const status = ORDER_STATUS[order.status] ?? { label: order.status, tone: 'neutral' as const };
  const pay = PAYMENT_STATUS[order.paymentStatus]
    ?? { label: order.paymentStatus, tone: 'neutral' as const };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b
                      border-ink-200 px-5 py-4">
        <div>
          <p className="text-xs text-ink-500">رقم الطلب</p>
          <p className="text-lg font-extrabold tabular text-ink-900" dir="ltr">
            {order.orderNumber}
          </p>
          <p className="text-xs text-ink-500">{formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone={pay.tone}>{pay.label}</Badge>
        </div>
      </div>

      <ul className="divide-y divide-ink-200">
        {order.items.map((item, i) => (
          <li key={`${item.productName}-${i}`}
              className="flex items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="font-bold text-ink-900">{item.productName}</p>
              {item.variantName && (
                <p className="text-xs text-ink-500">{item.variantName}</p>
              )}
              <p className="text-xs text-ink-500 tabular">
                {formatMoney(item.unitPrice)} × {item.quantity}
              </p>
            </div>
            <p className="font-bold tabular text-ink-900">{formatMoney(item.lineTotal)}</p>
          </li>
        ))}
      </ul>

      <dl className="space-y-2 border-t border-ink-200 px-5 py-4 text-sm">
        <Row label="المجموع" value={formatMoney(order.subtotal)} />
        <Row label="التوصيل" value={formatMoney(order.deliveryFee)} />
        {order.discountTotal > 0 && (
          <Row label={`الخصم${order.couponCode ? ` (${order.couponCode})` : ''}`}
               value={`− ${formatMoney(order.discountTotal)}`} />
        )}
        <div className="flex items-baseline justify-between border-t border-ink-200 pt-2">
          <dt className="font-bold text-ink-900">الإجمالي</dt>
          <dd className="text-lg font-extrabold tabular text-teal-700">
            {formatMoney(order.total)}
          </dd>
        </div>
      </dl>

      <div className="grid gap-3 border-t border-ink-200 px-5 py-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold text-ink-500">المستلم</p>
          <p className="text-ink-900">{order.contactName}</p>
          <p className="text-ink-700 tabular" dir="ltr">{order.contactPhone}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-ink-500">التوصيل</p>
          <p className="text-ink-900">{order.deliveryZoneName ?? '—'}</p>
          {order.deliveryAddress?.line && (
            <p className="text-ink-700">{order.deliveryAddress.line}</p>
          )}
          {order.deliveryAddress?.landmark && (
            <p className="text-xs text-ink-500">{order.deliveryAddress.landmark}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-bold text-ink-500">طريقة الدفع</p>
          <p className="text-ink-900">
            {PAYMENT_METHOD[order.paymentMethod] ?? order.paymentMethod}
          </p>
        </div>
        {order.note && (
          <div>
            <p className="text-xs font-bold text-ink-500">ملاحظتك</p>
            <p className="text-ink-700">{order.note}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-bold tabular text-ink-900">{value}</dd>
    </div>
  );
}
