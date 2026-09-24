import type { Metadata } from 'next';
import { TrendingUp } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/money/format';
import { loadPartnerCommissions } from '@/lib/partners/actions';

export const metadata: Metadata = {
  title: 'العمولات — الشريك',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/** حالة العمولة كما تسمّيها القاعدة. */
const STATUS: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'neutral' }> = {
  payable:  { label: 'مستحقة',  tone: 'warning' },
  reserved: { label: 'قيد الصرف', tone: 'info' },
  paid:     { label: 'مدفوعة',  tone: 'success' },
  reversed: { label: 'ملغاة',   tone: 'neutral' },
};

export default async function PartnerCommissionsPage() {
  const data = await loadPartnerCommissions();
  if (!data.ok) return <ErrorState description={data.message} />;
  const { rows, rate } = data.data;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-extrabold text-ink-900">العمولات</h1>
        <p className="mt-1 text-sm text-ink-500">
          تُقيَّد عند كل دفعة اشتراك مؤكدة — الاشتراك الأول وكل تجديد بعده.
          نسبتك الحالية {formatNumber(rate)}%.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card className="p-5">
          <EmptyState icon={<TrendingUp size={32} strokeWidth={1.5} />}
                      title="لا عمولات بعد"
                      description="تُضاف أول عمولة عند تأكيد أول اشتراك لمتجر من رابطك." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader title={`${formatNumber(rows.length)} قيد`} />
          <ul className="divide-y divide-ink-200">
            {rows.map((c) => {
              const s = STATUS[c.status] ?? { label: c.status, tone: 'neutral' as const };
              const negative = c.amount < 0;
              return (
                <li key={c.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 truncate font-bold text-ink-900">
                      {c.storeName}
                      {negative && (
                        <span className="ms-2 text-xs font-normal text-danger">
                          عكس استرداد
                        </span>
                      )}
                    </span>
                    <span className={`font-extrabold tabular ${
                      negative ? 'text-danger' : 'text-ink-900'}`}>
                      {formatMoney(c.amount)}
                    </span>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {c.planName ? `${c.planName} · ` : ''}
                    اشتراك {formatMoney(c.baseAmount)} ×{' '}
                    {formatNumber(c.rateApplied)}%
                    {' · '}{formatDateTime(c.paidAt ?? c.createdAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
