import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { adminHasLevel, getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { Badge } from '@/components/ui/Badge';
import { PayoutReviewRow } from '@/components/admin/PayoutReviewRow';
import { formatDateTime, formatMoney } from '@/lib/money/format';

export const metadata: Metadata = {
  title: 'صرف الشركاء — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }> = {
  submitted: { label: 'طلب الشريك', tone: 'warning' },
  pending_review: { label: 'مسجَّل — بانتظار الاعتماد', tone: 'warning' },
  approved: { label: 'معتمد — بانتظار الصرف', tone: 'info' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  paid: { label: 'مصروف', tone: 'success' },
};

type PayoutRow = {
  id: string; amount: number; status: string; note: string | null;
  created_at: string; paid_at: string | null; rejected_reason: string | null;
  requested_by: string | null; approved_by: string | null;
  partners: { name: string; email: string } | null;
};

export default async function AdminPayoutsPage() {
  await requirePlatformAccess('payouts', 'view');
  const actor = await getActor();
  const canRecord = actor.kind === 'user' && adminHasLevel(actor, 'payouts', 'edit');
  const canApprove = actor.kind === 'user' && adminHasLevel(actor, 'payouts', 'approve');

  const supabase = await createClient();
  const { data } = await supabase
    .from('partner_payouts')
    .select('id, amount, status, note, created_at, paid_at, rejected_reason, requested_by, approved_by, partners(name, email)')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as PayoutRow[];
  const open = rows.filter((r) => ['submitted', 'pending_review', 'approved'].includes(r.status));
  const done = rows.filter((r) => ['paid', 'rejected'].includes(r.status));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">صرف الشركاء</h1>
        <p className="text-sm text-sand-600">
          الشريك يطلب · موظف يسجّل · موظف آخر يعتمد. القيد في الجدول يرفض
          تطابق أي اثنين، ولا يتجاوزه أحد (D30).
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
          <ul className="divide-y divide-sand-200">
            {open.map((r) => {
              const s = STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const };
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-3
                                          px-4 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-navy-900">
                      {r.partners?.name ?? '—'}
                    </p>
                    <p className="text-xs text-sand-600">
                      {formatDateTime(r.created_at)}
                      {r.note && <span> · {r.note}</span>}
                    </p>
                  </div>
                  <span className="font-extrabold tabular text-navy-900">
                    {formatMoney(r.amount)}
                  </span>
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <PayoutReviewRow payoutId={r.id} status={r.status}
                                   canRecord={canRecord} canApprove={canApprove} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {done.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="طلبات منتهية" />
          <ul className="divide-y divide-sand-200">
            {done.map((r) => {
              const s = STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const };
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1
                                          px-4 py-3">
                  <span className="min-w-0 flex-1 truncate font-bold text-navy-900">
                    {r.partners?.name ?? '—'}
                  </span>
                  <span className="text-xs text-sand-600">
                    {formatDateTime(r.paid_at ?? r.created_at)}
                    {r.rejected_reason && (
                      <span className="block text-[--color-danger]">
                        {r.rejected_reason}
                      </span>
                    )}
                  </span>
                  <span className="font-bold tabular text-navy-900">
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
