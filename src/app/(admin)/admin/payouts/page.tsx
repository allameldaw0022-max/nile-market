import type { Metadata } from 'next';
import { Landmark, Wallet } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { adminHasLevel, getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { PayoutReviewRow } from '@/components/admin/PayoutReviewRow';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/money/format';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'صرف الشركاء — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  submitted:      { label: 'طلب الشريك',              tone: 'warning' },
  pending_review: { label: 'مسجَّل — بانتظار الاعتماد', tone: 'warning' },
  approved:       { label: 'معتمد — بانتظار التحويل',  tone: 'info' },
  rejected:       { label: 'مرفوض',                    tone: 'danger' },
  cancelled:      { label: 'سحبه الشريك',              tone: 'neutral' },
  paid:           { label: 'مصروف',                    tone: 'success' },
};

const OPEN = ['submitted', 'pending_review', 'approved'];

const METHOD: Record<string, string> = {
  bank_transfer: 'تحويل بنكي',
  bankak: 'بنكك',
};

export default async function AdminPayoutsPage() {
  await requirePlatformAccess('payouts', 'view');
  const actor = await getActor();
  const canRecord = actor.kind === 'user' && adminHasLevel(actor, 'payouts', 'edit');
  const canApprove = actor.kind === 'user' && adminHasLevel(actor, 'payouts', 'approve');

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'payout_admin_queue', { p_limit: 100 });
  if (error) return <ErrorState description="تعذّر تحميل طلبات الصرف" />;

  const rows = data ?? [];
  const open = rows.filter((r) => OPEN.includes(r.status));
  const done = rows.filter((r) => !OPEN.includes(r.status));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">صرف الشركاء</h1>
        <p className="text-sm text-ink-500">
          الشريك يطلب · موظف يسجّل · موظف آخر يعتمد · ثم يُحوَّل المبلغ
          يدويًا ويؤكَّد الدفع. القيد في الجدول يرفض تطابق أي اثنين (D30).
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="طلبات مفتوحة" description={`${open.length} طلب.`} />
        {open.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<Wallet size={32} strokeWidth={1.5} />}
                        title="لا طلبات صرف مفتوحة" />
          </div>
        ) : (
          <ul className="divide-y divide-ink-200">
            {open.map((r) => {
              const s = STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const };
              const acc = r.account_snapshot;
              return (
                <li key={r.payout_id} className="px-4 py-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-ink-900">
                        {r.partner_name}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {formatDateTime(r.created_at)}
                        {' · '}{formatNumber(Number(r.commission_count))} قيد عمولة
                        {r.note && <span> · {r.note}</span>}
                      </p>
                    </div>
                    <span className="font-extrabold tabular text-ink-900">
                      {formatMoney(r.amount)}
                    </span>
                    <Badge tone={s.tone}>{s.label}</Badge>
                    <PayoutReviewRow payoutId={r.payout_id} status={r.status}
                                     canRecord={canRecord} canApprove={canApprove} />
                  </div>

                  {/* ★ بيانات الاستلام كما أرسلها الشريك وقت الطلب —
                      بها يحوّل موظف الصرف، ولا تتغيّر بتغييره لحسابه */}
                  {acc && (
                    <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-md border
                                   border-ink-200 p-3 text-xs sm:grid-cols-2">
                      <Field label="وسيلة الاستلام"
                             value={METHOD[acc.method ?? ''] ?? acc.method} />
                      <Field label="اسم المستفيد" value={acc.beneficiary} />
                      {acc.bank && <Field label="البنك" value={acc.bank} />}
                      {acc.account && <Field label="رقم الحساب" value={acc.account} ltr />}
                      {acc.phone && <Field label="الهاتف" value={acc.phone} ltr />}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {done.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="طلبات منتهية" />
          <ul className="divide-y divide-ink-200">
            {done.map((r) => {
              const s = STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const };
              return (
                <li key={r.payout_id} className="flex flex-wrap items-center
                                                 gap-x-4 gap-y-1 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate font-bold text-ink-900">
                    {r.partner_name}
                  </span>
                  <span className="text-xs text-ink-500">
                    {formatDateTime(r.paid_at ?? r.created_at)}
                    {r.reference && <span dir="ltr"> · {r.reference}</span>}
                    {r.rejected_reason && (
                      <span className="block text-danger">{r.rejected_reason}</span>
                    )}
                  </span>
                  <span className="font-bold tabular text-ink-900">
                    {formatMoney(r.amount)}
                  </span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, ltr = false }: {
  label: string; value: string | null | undefined; ltr?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-ink-500">
        <Landmark size={11} className="inline-block" /> {label}
      </dt>
      <dd className="min-w-0 truncate font-bold text-ink-900"
          dir={ltr ? 'ltr' : undefined}>{value}</dd>
    </div>
  );
}
