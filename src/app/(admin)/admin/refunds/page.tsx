import Link from 'next/link';
import type { Metadata } from 'next';
import { Undo2 } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { adminHasLevel, getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { RefundReviewRow } from '@/components/admin/RefundReviewRow';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/money/format';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'الاستردادات — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const STATUS: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' }> = {
  submitted:      { label: 'طلب جديد',            tone: 'warning' },
  pending_review: { label: 'مسجَّل — بانتظار الاعتماد', tone: 'warning' },
  approved:       { label: 'معتمد — بانتظار الصرف',   tone: 'info' },
  rejected:       { label: 'مرفوض',               tone: 'danger' },
  completed:      { label: 'منفَّذ',               tone: 'success' },
};

/**
 * الاستردادات.
 *
 * ★ ثلاث خطوات بثلاثة أشخاص (D30): مَن بادر، ومَن سجّل، ومَن اعتمد.
 * القيود في الجدول ترفض تطابق أي اثنين ولا يتجاوزها service_role.
 *
 * ★ الإتمام يعكس عمولة الشريك بالتناسب في نفس المعاملة — وإلا دفعت
 * المنصة عمولة على مال أعادته.
 */
export default async function AdminRefundsPage(
  { searchParams }: PageProps<'/admin/refunds'>,
) {
  await requirePlatformAccess('payments', 'view');
  const actor = await getActor();
  const canRecord = actor.kind === 'user' && adminHasLevel(actor, 'payments', 'edit');
  const canApprove = actor.kind === 'user' && adminHasLevel(actor, 'payments', 'approve');
  const myId = actor.kind === 'user' ? actor.userId : null;

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const status = typeof sp.status === 'string' ? sp.status : '';

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'refunds_page', {
    p_status: STATUS[status] ? status : null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) return <ErrorState description="تعذّر تحميل الاستردادات" />;

  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (patch: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, String(v));
    }
    return `/admin/refunds?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">الاستردادات</h1>
        <p className="text-sm text-ink-500">
          {formatNumber(total)} طلب — مَن بادر بالطلب لا يسجّله، ومَن سجّله
          لا يعتمده (D30).
        </p>
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="تصفية الحالة">
        <Link href={qs({ status: null, page: null })} className={chip(!status)}>الكل</Link>
        {Object.entries(STATUS).map(([value, s]) => (
          <Link key={value} href={qs({ status: value, page: null })}
                className={chip(status === value)}>{s.label}</Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={<Undo2 size={36} strokeWidth={1.5} />}
                    title="لا طلبات استرداد" />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader title="طلبات الاسترداد"
                      description="الإتمام يقيّد الاسترداد في الدفتر ويعكس عمولة الشريك." />
          <ul className="divide-y divide-ink-200">
            {rows.map((r) => {
              const s = STATUS[r.status] ?? { label: r.status, tone: 'warning' as const };
              return (
                <li key={r.refund_id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-ink-900">
                      {r.store_name ?? 'المنصة'}
                      <span className="ms-2 text-xs font-medium text-ink-500">
                        {r.kind === 'subscription' ? 'اشتراك' : 'طلب متجر'}
                        {r.order_number && ` · ${r.order_number}`}
                      </span>
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {r.reason} · {formatDateTime(r.created_at)}
                    </p>
                  </div>

                  <span className="font-extrabold tabular text-ink-900">
                    {formatMoney(r.amount)}
                  </span>
                  <Badge tone={s.tone}>{s.label}</Badge>

                  <RefundReviewRow
                    refundId={r.refund_id}
                    status={r.status}
                    canRecord={canRecord}
                    canApprove={canApprove}
                    isInitiator={myId !== null && r.initiated_by === myId}
                    isRequester={myId !== null && r.requested_by === myId}
                  />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="ترقيم الصفحات">
          {page > 1 && (
            <Link href={qs({ page: page - 1 })}>
              <Button variant="outline" size="sm">السابق</Button>
            </Link>
          )}
          <span className="text-sm text-ink-500 tabular">صفحة {page} من {pages}</span>
          {page < pages && (
            <Link href={qs({ page: page + 1 })}>
              <Button variant="outline" size="sm">التالي</Button>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

const chip = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${active
    ? 'border-teal-600 bg-teal-600 text-white'
    : 'border-ink-300 bg-white text-ink-600 hover:border-teal-400'}`;
