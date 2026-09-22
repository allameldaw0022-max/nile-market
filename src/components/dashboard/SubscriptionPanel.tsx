'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, Check, CheckCircle2, Copy, Info, Landmark, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Badge, StatusChip } from '@/components/ui/Badge';
import { SUBSCRIPTION_STATUS } from '@/lib/status';
import { formatDate, formatMoney } from '@/lib/money/format';
import {
  cancelSubscriptionRequest, submitSubscriptionRequest,
  type CurrentSubscription, type PlanOption, type SubscriptionRequestRow,
} from '@/lib/subscriptions/actions';

const FEATURE_LABEL: Record<string, string> = {
  'products.max': 'عدد المنتجات',
  'employees.max': 'عدد الموظفين',
  'storage.mb': 'مساحة التخزين (ميجابايت)',
  'coupons.max_active': 'أكواد خصم نشطة',
  'promotions.max_active': 'عروض نشطة',
  'orders.monthly_max': 'طلبات شهريًا',
  'custom_domain.enabled': 'دومين مخصص',
  'analytics.advanced': 'تحليلات متقدمة',
  'import_export.enabled': 'استيراد وتصدير',
  'variants.enabled': 'خيارات المنتج',
  'whatsapp.enabled': 'زر واتساب',
};

const REQUEST_STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  pending: { label: 'قيد المراجعة', tone: 'warning' },
  approved: { label: 'معتمد', tone: 'success' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  cancelled: { label: 'مسحوب', tone: 'neutral' },
};

/**
 * الاشتراك.
 *
 * ★ الواجهة لا ترسل مبلغًا: `submit_subscription_request` تقرأ سعر
 * الباقة من القاعدة. السعر المعروض هنا للاطلاع فقط، والمحفوظ في
 * الطلب هو ما تقرؤه القاعدة لحظة الإرسال.
 */
export function SubscriptionPanel({
  storeId, current, plans, requests, payment, canManage, idempotencyKey,
}: {
  storeId: string;
  current: CurrentSubscription | null;
  plans: PlanOption[];
  requests: SubscriptionRequestRow[];
  payment: { accounts: { bank?: string; account?: string; holder?: string }[];
             bankak: string | null; instructions: string | null } | null;
  canManage: boolean;
  idempotencyKey: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PlanOption | null>(null);
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const hasPending = requests.some((r) => r.status === 'pending');

  const submit = () => start(async () => {
    if (!selected) return;
    setError(null);
    const res = await submitSubscriptionRequest({
      storeId, planId: selected.id, reference, idempotencyKey,
    });
    if (!res.ok) { setError(res.message); return; }
    setSelected(null);
    setReference('');
    router.refresh();
  });

  const cancel = (requestId: string) => start(async () => {
    setError(null);
    const res = await cancelSubscriptionRequest({ storeId, requestId });
    if (!res.ok) { setError(res.message); return; }
    router.refresh();
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* الحافظة محجوبة */ }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      <Card>
        <CardHeader title="اشتراكك الحالي" />
        <div className="space-y-3 p-5">
          {current ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-extrabold text-navy-900">
                  {current.planName}
                </span>
                <StatusChip map={SUBSCRIPTION_STATUS} value={current.status} />
              </div>

              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <Row label="بدأ في" value={formatDate(current.startedAt)} />
                <Row label="ينتهي في"
                     value={current.currentPeriodEnd
                       ? formatDate(current.currentPeriodEnd)
                       : 'بلا تاريخ انتهاء'} />
                {current.graceEndsAt && (
                  <Row label="فترة السماح حتى" value={formatDate(current.graceEndsAt)} />
                )}
              </dl>

              {(current.status === 'expired' || current.status === 'suspended') && (
                <p className="rounded-[--radius-md] border border-gold-500/40
                              bg-gold-400/10 p-3.5 text-sm text-navy-700">
                  الشراء من متجرك متوقف حاليًا. بياناتك ومنتجاتك وطلباتك محفوظة
                  بالكامل، وتعود فور اعتماد التجديد.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-sand-600">لا يوجد اشتراك مسجَّل لهذا المتجر.</p>
          )}
        </div>
      </Card>

      <div>
        <h2 className="mb-3 font-bold text-navy-900">الباقات</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = current?.planId === plan.id;
            const buyable = !plan.isFree && plan.priceConfigured;

            return (
              <Card key={plan.id}
                    className={`flex flex-col p-5 ${isCurrent ? 'border-nile-500' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-extrabold text-navy-900">{plan.name}</h3>
                  {isCurrent && <Badge tone="info">باقتك</Badge>}
                </div>

                {plan.description && (
                  <p className="mt-1 text-xs text-sand-600">{plan.description}</p>
                )}

                <p className="mt-3 text-2xl font-extrabold tabular text-nile-600">
                  {plan.isFree ? 'مجانية'
                    : plan.priceConfigured ? formatMoney(plan.price)
                    : '—'}
                </p>
                {buyable && (
                  <p className="text-xs text-sand-600 tabular">
                    كل {plan.durationDays} يومًا
                  </p>
                )}
                {!plan.isFree && !plan.priceConfigured && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-sand-600">
                    <Info size={12} /> لم يُضبط سعر هذه الباقة بعد
                  </p>
                )}

                <ul className="mt-4 flex-1 space-y-1.5 text-xs text-navy-700">
                  {plan.entitlements
                    .filter((e) => e.configured)
                    .map((e) => (
                      <li key={e.key} className="flex items-start gap-1.5">
                        <Check size={12} className="mt-0.5 shrink-0 text-[--color-success]" />
                        <span>
                          {FEATURE_LABEL[e.key] ?? e.key}
                          {e.bool !== null
                            ? (e.bool ? '' : ' — غير متاح')
                            : e.limit === null ? ' — بلا حد'
                            : `: ${e.limit}`}
                        </span>
                      </li>
                    ))}
                </ul>

                {canManage && buyable && !isCurrent && (
                  <Button className="mt-4" variant="outline" disabled={hasPending}
                          onClick={() => { setSelected(plan); setError(null); }}>
                    {hasPending ? 'لديك طلب قيد المراجعة' : 'اطلب هذه الباقة'}
                  </Button>
                )}
                {canManage && buyable && isCurrent && (
                  <Button className="mt-4" variant="outline" disabled={hasPending}
                          onClick={() => { setSelected(plan); setError(null); }}>
                    {hasPending ? 'لديك طلب قيد المراجعة' : 'تجديد'}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {selected && (
        <Card>
          <CardHeader title={`طلب باقة ${selected.name}`}
                      description="حوّل المبلغ ثم أرسل الطلب برقم العملية." />
          <div className="space-y-4 p-5">
            <p className="rounded-[--radius-md] border border-sand-200 bg-sand-50 p-3.5
                          text-sm">
              <span className="text-sand-600">المبلغ المطلوب: </span>
              <span className="font-extrabold tabular text-navy-900">
                {formatMoney(selected.price)}
              </span>
            </p>

            {payment && (payment.accounts.length > 0 || payment.bankak) && (
              <div className="space-y-2 rounded-[--radius-md] border border-sand-200 p-4">
                <p className="flex items-center gap-1.5 text-sm font-bold text-navy-900">
                  <Landmark size={14} /> حوّل إلى أحد حسابات نايل ماركت
                </p>
                {payment.bankak && (
                  <AccountRow bank="بنكك" account={payment.bankak}
                              onCopy={() => copy(payment.bankak!)}
                              copied={copied === payment.bankak} />
                )}
                {payment.accounts.map((a, i) => (
                  <AccountRow key={`${a.account}-${i}`}
                              bank={a.bank ?? 'بنك'} account={a.account ?? ''}
                              holder={a.holder}
                              onCopy={() => copy(a.account ?? '')}
                              copied={copied === a.account} />
                ))}
                {payment.instructions && (
                  <p className="border-t border-sand-200 pt-2 text-xs text-sand-600">
                    {payment.instructions}
                  </p>
                )}
              </div>
            )}

            <Input label="رقم العملية أو اسم المحوِّل" value={reference} dir="ltr"
                   onChange={(e) => setReference(e.target.value)}
                   hint="يساعد فريقنا على مطابقة تحويلك بسرعة." />

            <div className="flex flex-wrap gap-2">
              <Button loading={pending} icon={<Send size={15} />} onClick={submit}>
                إرسال الطلب
              </Button>
              <Button variant="ghost" onClick={() => setSelected(null)}>إلغاء</Button>
            </div>

            <p className="text-xs text-sand-600">
              يراجع فريقنا التحويل يدويًا ثم يُفعَّل اشتراكك. لا يوجد تجديد آلي
              ولا خصم تلقائي من أي بطاقة.
            </p>
          </div>
        </Card>
      )}

      {requests.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="طلبات الاشتراك" />
          <ul className="divide-y divide-sand-200">
            {requests.map((r) => {
              const status = REQUEST_STATUS[r.status]
                ?? { label: r.status, tone: 'neutral' as const };
              return (
                <li key={r.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                  <span className="font-bold text-navy-900">{r.planName}</span>
                  <span className="font-bold tabular text-navy-900">
                    {formatMoney(r.netAmount)}
                  </span>
                  <span className="min-w-0 flex-1 text-xs text-sand-600">
                    {formatDate(r.createdAt)}
                    {r.reference && <span dir="ltr"> · {r.reference}</span>}
                    {r.rejectionReason && (
                      <span className="block text-[--color-danger]">
                        السبب: {r.rejectionReason}
                      </span>
                    )}
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {canManage && r.status === 'pending' && (
                    <Button variant="ghost" size="sm" loading={pending}
                            onClick={() => cancel(r.id)}>
                      سحب
                    </Button>
                  )}
                  {r.status === 'approved' && (
                    <CheckCircle2 size={16} className="text-[--color-success]" />
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 sm:block">
      <dt className="text-xs text-sand-600">{label}</dt>
      <dd className="font-bold text-navy-900">{value}</dd>
    </div>
  );
}

function AccountRow({ bank, account, holder, onCopy, copied }: {
  bank: string; account: string; holder?: string;
  onCopy: () => void; copied: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-bold text-navy-900">{bank}</span>
      {holder && <span className="text-xs text-sand-600">{holder}</span>}
      <code className="min-w-0 flex-1 truncate rounded bg-sand-50 px-2 py-1 text-xs
                       text-navy-900" dir="ltr">{account}</code>
      <button type="button" onClick={onCopy} aria-label={`نسخ رقم ${bank}`}
              className="rounded p-1.5 text-sand-600 hover:text-nile-600">
        {copied ? <Check size={14} className="text-[--color-success]" /> : <Copy size={14} />}
      </button>
    </div>
  );
}
