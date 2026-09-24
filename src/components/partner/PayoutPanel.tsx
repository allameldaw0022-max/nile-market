'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Send, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/money/format';
import {
  cancelPayout, requestPayout,
  type PartnerBalance, type PayoutAccount, type PayoutRow,
} from '@/lib/partners/actions';

const STATUS: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  submitted:      { label: 'بانتظار المراجعة',   tone: 'warning' },
  pending_review: { label: 'قيد المراجعة',        tone: 'warning' },
  approved:       { label: 'معتمد — بانتظار التحويل', tone: 'info' },
  paid:           { label: 'مدفوع',               tone: 'success' },
  rejected:       { label: 'مرفوض',               tone: 'danger' },
  cancelled:      { label: 'مسحوب',               tone: 'neutral' },
};

const OPEN = ['submitted', 'pending_review', 'approved'];

/**
 * مستحقات الشريك وطلب الصرف.
 *
 * ★ لا حقل مبلغ. القاعدة تجمع العمولات المتاحة وتحجزها في معاملة
 * واحدة، فلا يكتب الشريك رقمًا ولا تُطلب نفس العمولة مرتين.
 *
 * ★ الزرّ يختفي حين لا ينفع — لكن المنع في القاعدة: رصيد صفر،
 * بيانات ناقصة، أو طلب قائم، كلها ترفضها الدالة نفسها.
 */
export function PayoutPanel({ balance, payouts, account, idempotencyKey }: {
  balance: PartnerBalance;
  payouts: PayoutRow[];
  account: PayoutAccount;
  idempotencyKey: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openRequest = payouts.find((p) => OPEN.includes(p.status));
  const canRequest = !openRequest && account.isComplete && balance.payable > 0;

  const submit = () => start(async () => {
    setError(null);
    const res = await requestPayout({ note, idempotencyKey });
    if (!res.ok) { setError(res.message); return; }
    setNote('');
    router.refresh();
  });

  const withdraw = (id: string) => start(async () => {
    setError(null);
    const res = await cancelPayout(id);
    if (!res.ok) { setError(res.message); return; }
    router.refresh();
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-extrabold text-ink-900">مستحقاتي</h1>
        <p className="mt-1 text-sm text-ink-500">
          نحوّل المبلغ يدويًا إلى حسابك بعد اعتماد الطلب.
        </p>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border
                        border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="إجمالي العمولات" value={formatMoney(balance.total)} />
        <Stat label="المستحق" value={formatMoney(balance.payable)} accent />
        <Stat label="قيد الصرف" value={formatMoney(balance.reserved)} />
        <Stat label="المدفوع" value={formatMoney(balance.paid)} />
      </div>

      <Card className="p-5">
        {openRequest ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 font-bold text-ink-900">
              <Wallet size={16} /> لديك طلب صرف قائم
            </p>
            <p className="text-sm text-ink-600">
              {formatMoney(openRequest.amount)} ·{' '}
              {STATUS[openRequest.status]?.label ?? openRequest.status}
            </p>
            {openRequest.status === 'submitted' && (
              <Button variant="ghost" size="sm" loading={pending}
                      onClick={() => withdraw(openRequest.id)}>
                سحب الطلب
              </Button>
            )}
          </div>
        ) : !account.isComplete ? (
          <div className="space-y-2">
            <p className="font-bold text-ink-900">أضف بيانات استلام الأرباح</p>
            <p className="text-sm text-ink-600">
              لا يمكن طلب الصرف قبل أن نعرف إلى أين نحوّل.
            </p>
            <Link href="/partner/settings">
              <Button variant="outline" size="sm">إضافة البيانات</Button>
            </Link>
          </div>
        ) : balance.payable <= 0 ? (
          <p className="text-sm text-ink-500">
            لا رصيد مستحق للصرف حاليًا. تُضاف العمولة عند كل دفعة اشتراك
            مؤكدة من متاجرك المحالة.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              سيُطلب صرف كامل رصيدك المستحق:{' '}
              <span className="font-extrabold tabular text-teal-700">
                {formatMoney(balance.payable)}
              </span>
            </p>
            <Textarea label="ملاحظة (اختياري)" value={note}
                      onChange={(e) => setNote(e.target.value)} />
            <Button loading={pending} disabled={!canRequest}
                    icon={<Send size={15} />} onClick={submit}>
              طلب صرف
            </Button>
          </div>
        )}
      </Card>

      {payouts.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="سجل الطلبات" />
          <ul className="divide-y divide-ink-200">
            {payouts.map((p) => {
              const s = STATUS[p.status] ?? { label: p.status, tone: 'neutral' as const };
              return (
                <li key={p.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-bold tabular text-ink-900">
                      {formatMoney(p.amount)}
                    </span>
                    <Badge tone={s.tone}>{s.label}</Badge>
                    <span className="ms-auto text-xs text-ink-500">
                      {formatDate(p.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {formatNumber(p.commissionCount)} قيد عمولة
                    {p.transferredAt && ` · حُوّل ${formatDateTime(p.transferredAt)}`}
                    {p.reference && <span dir="ltr"> · {p.reference}</span>}
                  </p>
                  {p.rejectedReason && (
                    <p className="mt-1 text-xs text-danger">
                      سبب الرفض: {p.rejectedReason}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, accent = false }: {
  label: string; value: string; accent?: boolean;
}) {
  return (
    <Card className="p-3.5">
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`mt-1 text-lg font-extrabold tabular ${
        accent ? 'text-teal-700' : 'text-ink-900'}`}>{value}</p>
    </Card>
  );
}
