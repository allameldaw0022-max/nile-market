'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Landmark, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { ReceiptViewer } from '@/components/shared/ReceiptViewer';
import { formatDateTime, formatMoney } from '@/lib/money/format';
import {
  orderReceiptUrl, reviewOrderPayment, type OrderReceipt,
} from '@/lib/payments/receipts';

const STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'بانتظار تحققك', tone: 'warning' },
  paid:    { label: 'مؤكَّد',        tone: 'success' },
  failed:  { label: 'مرفوض',        tone: 'danger' },
};

/**
 * إيصالات تحويل الزبون على هذا الطلب.
 *
 * ★ الطلب وصلك «بانتظار التحقق» لأن الزبون رفع إيصالًا — لا لأن
 * أحدًا أكّد دفعًا. التأكيد هنا، بضغطة صاحب الصلاحية، وهو وحده ما
 * يجعل الطلب مدفوعًا.
 */
export function OrderReceiptPanel({ storeId, orderId, receipts, canReview }: {
  storeId: string; orderId: string; receipts: OrderReceipt[]; canReview: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();

  if (receipts.length === 0) return null;

  const decide = (paymentId: string, action: 'approve' | 'reject') =>
    start(async () => {
      setError(null);
      const res = await reviewOrderPayment({
        storeId, orderId, paymentId, action,
        reason: action === 'reject' ? reason : undefined,
      });
      if (!res.ok) { setError(res.message); return; }
      setRejecting(null);
      setReason('');
      router.refresh();
    });

  return (
    <Card>
      <CardHeader title="إيصال التحويل"
                  description="تحقّق من وصول المبلغ إلى حسابك قبل التأكيد." />
      <ul className="divide-y divide-ink-200">
        {receipts.map((r) => {
          const status = STATUS[r.status]
            ?? { label: r.status, tone: 'warning' as const };
          return (
            <li key={r.paymentId} className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Landmark size={15} className="text-ink-500" />
                <span className="font-extrabold tabular text-ink-900">
                  {formatMoney(r.amount)}
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
                <span className="min-w-0 flex-1 text-xs text-ink-500">
                  أرسله الزبون {formatDateTime(r.submittedAt)}
                  {r.reference && <span dir="ltr"> · {r.reference}</span>}
                </span>
              </div>

              <ReceiptViewer mime={r.mime}
                             load={() => orderReceiptUrl({
                               storeId, orderId, paymentId: r.paymentId,
                             })} />

              {r.status === 'paid' && r.confirmedAt && (
                <p className="text-xs text-success">
                  أكّده {r.confirmedByName ?? 'أحد أعضاء الفريق'}
                  {' · '}{formatDateTime(r.confirmedAt)}
                </p>
              )}
              {r.status === 'failed' && r.failedReason && (
                <p className="text-xs text-danger">سبب الرفض: {r.failedReason}</p>
              )}

              {canReview && r.status === 'pending' && (
                rejecting === r.paymentId ? (
                  <div className="space-y-2 rounded-md border border-ink-200 p-3">
                    <Input label="سبب الرفض" value={reason} autoFocus
                           onChange={(e) => setReason(e.target.value)}
                           placeholder="لم يصل المبلغ / المبلغ ناقص / الإيصال غير واضح" />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="danger" loading={pending}
                              disabled={!reason.trim()}
                              onClick={() => decide(r.paymentId, 'reject')}>
                        تأكيد الرفض
                      </Button>
                      <Button size="sm" variant="ghost"
                              onClick={() => { setRejecting(null); setReason(''); }}>
                        تراجع
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" icon={<Check size={14} />} loading={pending}
                            onClick={() => decide(r.paymentId, 'approve')}>
                      تأكيد استلام التحويل
                    </Button>
                    <Button size="sm" variant="outline" icon={<X size={14} />}
                            onClick={() => setRejecting(r.paymentId)}>
                      رفض
                    </Button>
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="flex items-start gap-2 border-t border-ink-200
                        bg-danger-bg p-3 text-sm text-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}
        </p>
      )}
    </Card>
  );
}
