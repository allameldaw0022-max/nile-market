'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, Check, Copy, Link2, Store, TrendingUp, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { formatDate, formatMoney, formatNumber } from '@/lib/money/format';
import {
  requestPayout, type CommissionRow, type PartnerBalance, type PartnerProfile,
  type PayoutRow, type ReferralRow,
} from '@/lib/partners/actions';

const PAYOUT_STATUS: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  submitted: { label: 'قيد المراجعة', tone: 'warning' },
  pending_review: { label: 'قيد المراجعة', tone: 'warning' },
  approved: { label: 'معتمد — بانتظار الصرف', tone: 'info' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  paid: { label: 'مدفوع', tone: 'success' },
};

const COMMISSION_STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  payable: { label: 'مستحقة', tone: 'warning' },
  paid: { label: 'مدفوعة', tone: 'success' },
  reversed: { label: 'معكوسة', tone: 'danger' },
  pending: { label: 'معلّقة', tone: 'neutral' },
};

/**
 * لوحة الشريك.
 *
 * ★ الرصيد المعروض محسوب في القاعدة (`partner_balances`) من دفتر
 * العمولات الإلحاقي — لا يُجمَع في المتصفح. والمتاح للسحب = المستحق
 * ناقص ما هو محجوز في طلبات معلّقة، وهو نفس ما تتحقق منه القاعدة
 * عند الطلب.
 */
export function PartnerDashboard({
  profile, balance, pendingPayouts, referrals, commissions, payouts, idempotencyKey,
}: {
  profile: PartnerProfile;
  balance: PartnerBalance;
  pendingPayouts: number;
  referrals: ReferralRow[];
  commissions: CommissionRow[];
  payouts: PayoutRow[];
  idempotencyKey: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const available = Math.max(balance.payable - pendingPayouts, 0);
  const isActive = profile.status === 'active';

  const submit = () => start(async () => {
    setError(null);
    const value = Number(amount.replace(/,/g, ''));
    const res = await requestPayout({ amount: value, note, idempotencyKey });
    if (!res.ok) { setError(res.message); return; }
    setAmount('');
    setNote('');
    setAsking(false);
    router.refresh();
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profile.referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* الحافظة محجوبة */ }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">مرحبًا {profile.name}</h1>
        <p className="text-sm text-ink-500">
          نسبة عمولتك <span className="tabular font-bold">{profile.commissionRate}%</span>
          {' '}من قيمة اشتراك كل متجر أحلته.
        </p>
      </div>

      {!isActive && (
        <p role="status" className="rounded-md border border-gold-500/40
                        bg-gold-300/10 p-3.5 text-sm text-ink-700">
          حسابك كشريك غير نشط حاليًا. تواصل مع فريق سوق النيل لتفعيله.
        </p>
      )}

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-bold text-ink-900">
          <Link2 size={16} /> رابط الإحالة
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          كل من يفتح هذا الرابط ثم ينشئ متجرًا خلال 30 يومًا يُحتسب لك.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border
                           border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-900"
                dir="ltr">{profile.referralUrl}</code>
          <Button variant="outline" size="sm" onClick={copy}
                  icon={copied ? <Check size={14} /> : <Copy size={14} />}>
            {copied ? 'نُسخ' : 'نسخ'}
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="متاح للسحب" value={formatMoney(available)} tone="gold" />
        <StatCard label="محجوز في طلبات" value={formatMoney(pendingPayouts)} />
        <StatCard label="صُرف لك" value={formatMoney(balance.paid)} />
        <StatCard label="متاجر أحلتها" value={formatNumber(referrals.length)} />
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border
                        border-danger/30 bg-danger-bg p-3
                        text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      {isActive && (
        asking ? (
          <Card>
            <CardHeader title="طلب صرف"
                        description="يراجعه موظف ويعتمده موظف آخر قبل التحويل." />
            <div className="space-y-4 p-5">
              <Input label="المبلغ" value={amount} type="number" min={1} step="0.01"
                     inputMode="decimal" dir="ltr"
                     hint={`المتاح: ${formatMoney(available)}`}
                     onChange={(e) => setAmount(e.target.value)} />
              <Textarea label="ملاحظة (اختياري)" value={note}
                        onChange={(e) => setNote(e.target.value)}
                        hint="وسيلة الاستلام المفضّلة مثلًا." />
              <div className="flex gap-2">
                <Button loading={pending} disabled={!amount.trim()} onClick={submit}>
                  إرسال الطلب
                </Button>
                <Button variant="ghost" onClick={() => { setAsking(false); setError(null); }}>
                  إلغاء
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Button icon={<Wallet size={16} />} disabled={available <= 0}
                  onClick={() => setAsking(true)}>
            {available > 0 ? 'طلب صرف' : 'لا رصيد متاح للسحب'}
          </Button>
        )
      )}

      {payouts.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="طلبات الصرف" />
          <ul className="divide-y divide-ink-200">
            {payouts.map((p) => {
              const status = PAYOUT_STATUS[p.status]
                ?? { label: p.status, tone: 'neutral' as const };
              return (
                <li key={p.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5">
                  <span className="font-bold tabular text-ink-900">
                    {formatMoney(p.amount)}
                  </span>
                  <span className="min-w-0 flex-1 text-xs text-ink-500">
                    {formatDate(p.createdAt)}
                    {p.paidAt && ` · صُرف ${formatDate(p.paidAt)}`}
                    {p.rejectedReason && (
                      <span className="block text-danger">
                        السبب: {p.rejectedReason}
                      </span>
                    )}
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="العمولات"
                    description="تُحتسب عند اعتماد اشتراك متجر أحلته." />
        {commissions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-500">
            لا عمولات بعد.
          </p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {commissions.map((c) => {
              const status = COMMISSION_STATUS[c.status]
                ?? { label: c.status, tone: 'neutral' as const };
              return (
                <li key={c.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <TrendingUp size={14}
                              className={c.amount < 0 ? 'text-danger'
                                : 'text-success'} />
                  <span className={`font-bold tabular ${c.amount < 0
                    ? 'text-danger' : 'text-ink-900'}`} dir="ltr">
                    {formatMoney(c.amount)}
                  </span>
                  <span className="min-w-0 flex-1 text-xs text-ink-500 tabular">
                    {c.rateApplied}% من {formatMoney(c.baseAmount)} ·{' '}
                    {formatDate(c.createdAt)}
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="المتاجر التي أحلتها" />
        {referrals.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-500">
            لا إحالات بعد — شارك رابطك للبدء.
          </p>
        ) : (
          <ul className="divide-y divide-ink-200">
            {referrals.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Store size={15} className="text-ink-500" />
                <span className="min-w-0 flex-1 truncate font-bold text-ink-900">
                  {r.storeName ?? 'متجر'}
                </span>
                <span className="text-xs text-ink-500">{formatDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
