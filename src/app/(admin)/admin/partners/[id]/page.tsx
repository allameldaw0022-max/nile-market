import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChevronRight, Store } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/money/format';
import { SUBSCRIPTION_STATUS } from '@/lib/status';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'ملف المسوّق — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/** حالة العمولة كما تسمّيها القاعدة. */
const COMMISSION_STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  payable:  { label: 'مستحقة', tone: 'warning' },
  paid:     { label: 'مدفوعة', tone: 'success' },
  reversed: { label: 'ملغاة',  tone: 'neutral' },
};

const PARTNER_STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  invited:   { label: 'مدعو',  tone: 'warning' },
  active:    { label: 'نشط',   tone: 'success' },
  suspended: { label: 'موقوف', tone: 'danger' },
};

/**
 * ملف مسوّق واحد: تجاره التابعون، اشتراكاتهم وتجديداتهم، وعمولاته
 * بحالتها.
 *
 * ★ الصفحة لا تقرأ الجداول مباشرةً: `partner_referred_stores` و
 * `partner_commission_rows` تفحصان `partners:view` بأنفسهما، فلا
 * يكفي معرفة رابط الصفحة لرؤية بيانات مسوّق.
 */
export default async function AdminPartnerDetailPage(
  { params }: PageProps<'/admin/partners/[id]'>,
) {
  await requirePlatformAccess('partners', 'view');
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: partnerRows }, storesRes, commissionsRes] = await Promise.all([
    rpc(supabase, 'partner_admin_list', {
      p_search: null, p_status: null, p_limit: 100, p_offset: 0,
    }),
    rpc(supabase, 'partner_referred_stores', { p_partner_id: id }),
    rpc(supabase, 'partner_commission_rows', { p_partner_id: id, p_limit: 100 }),
  ]);

  const partner = (partnerRows ?? []).find((p) => p.partner_id === id);
  if (!partner) notFound();
  if (storesRes.error || commissionsRes.error) {
    return <ErrorState description="تعذّر تحميل بيانات المسوّق" />;
  }

  const stores = storesRes.data ?? [];
  const commissions = commissionsRes.data ?? [];
  const renewals = stores.reduce((n, s) => n + Number(s.paid_subscriptions), 0);
  const s = PARTNER_STATUS[partner.status]
    ?? { label: partner.status, tone: 'warning' as const };

  return (
    <div className="space-y-5">
      <Link href="/admin/partners"
            className="inline-flex items-center gap-1 text-sm font-bold text-ink-500
                       hover:text-teal-700">
        <ChevronRight size={15} /> الشركاء والمسوّقون
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold text-ink-900">
            {partner.name}
          </h1>
          <p className="truncate text-sm text-ink-500" dir="ltr">
            {partner.email} · {partner.referral_code}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">نسبة {formatNumber(Number(partner.commission_rate))}%</Badge>
          <Badge tone={s.tone}>{s.label}</Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="تجار تابعون" value={formatNumber(stores.length)} />
        <Stat label="اشتراكات وتجديدات مدفوعة" value={formatNumber(renewals)} />
        <Stat label="مستحق" value={formatMoney(partner.payable)} />
        <Stat label="مدفوع" value={formatMoney(partner.paid)} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="التجار التابعون"
                    description="صاحب الإحالة ثابت بعد تسجيل التاجر — لا يتغيّر إلا بقرار إداري." />
        {stores.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<Store size={32} strokeWidth={1.5} />}
                        title="لا تجار تابعون بعد" />
          </div>
        ) : (
          <ul className="divide-y divide-ink-200">
            {stores.map((row) => (
              <li key={row.store_id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink-900">{row.store_name}</p>
                  <p className="truncate text-xs text-ink-500">
                    <span dir="ltr">{row.store_slug}</span>
                    {' · سُجّل '}{formatDate(row.attributed_at)}
                    {' · '}{formatNumber(Number(row.paid_subscriptions))} دفعة مؤكَّدة
                    {row.last_paid_at && ` · آخرها ${formatDate(row.last_paid_at)}`}
                  </p>
                </div>
                <span className="text-xs text-ink-500">
                  {row.plan_name ?? '—'}
                  {row.current_period_end
                    && ` · حتى ${formatDate(row.current_period_end)}`}
                </span>
                {row.subscription_status && (
                  <Badge tone={SUBSCRIPTION_STATUS[row.subscription_status]?.tone ?? 'neutral'}>
                    {SUBSCRIPTION_STATUS[row.subscription_status]?.label
                      ?? row.subscription_status}
                  </Badge>
                )}
                <span className="font-bold tabular text-ink-900">
                  {formatMoney(row.commission_total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="العمولات"
                    description="تُقيَّد على دفعة اشتراك مؤكَّدة وحدها — لا على إنشاء حساب ولا على طلب قيد المراجعة." />
        {commissions.length === 0 ? (
          <div className="p-5">
            <EmptyState title="لا عمولات بعد" />
          </div>
        ) : (
          <ul className="divide-y divide-ink-200">
            {commissions.map((c) => {
              const cs = COMMISSION_STATUS[c.status]
                ?? { label: c.status, tone: 'neutral' as const };
              return (
                <li key={c.commission_id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate font-bold text-ink-900">
                    {c.store_name}
                    {c.entry_kind === 'reversal' && (
                      <span className="ms-2 text-xs font-normal text-danger">
                        عكس استرداد
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-ink-500 tabular">
                    {c.plan_name ? `${c.plan_name} · ` : ''}
                    {formatMoney(c.base_amount)} × {formatNumber(Number(c.rate_applied))}%
                  </span>
                  <span className="text-xs text-ink-500">
                    {formatDateTime(c.paid_at ?? c.created_at)}
                  </span>
                  <span className={`font-bold tabular ${
                    Number(c.amount) < 0 ? 'text-danger' : 'text-ink-900'}`}>
                    {formatMoney(c.amount)}
                  </span>
                  <Badge tone={cs.tone}>{cs.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-lg font-extrabold tabular text-ink-900">{value}</p>
    </Card>
  );
}
