import Link from 'next/link';
import type { Metadata } from 'next';
import { CreditCard } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { PAYMENT_METHOD, PAYMENT_STATUS } from '@/lib/status';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/money/format';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'المدفوعات — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const KINDS: Record<string, string> = {
  subscription: 'اشتراك', order: 'طلب متجر',
};
const STATUSES = ['pending', 'paid', 'refunded', 'partially_refunded'] as const;

/**
 * سجلّ المدفوعات.
 *
 * ★ للقراءة فقط: الدفعة لا تُعدَّل ولا تُحذف من هنا. الاعتماد يمرّ
 * بمراجعة طلب الاشتراك، والاسترداد بمساره الخاص بقيوده (D30) —
 * وتحرير صفٍّ مالي مباشرةً يكسر الدفتر.
 */
export default async function AdminPaymentsPage(
  { searchParams }: PageProps<'/admin/payments'>,
) {
  await requirePlatformAccess('payments', 'view');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const term = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 60);
  const status = typeof sp.status === 'string' ? sp.status : '';
  const kind = typeof sp.kind === 'string' ? sp.kind : '';

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'payments_page', {
    p_status: (STATUSES as readonly string[]).includes(status) ? status : null,
    p_kind: KINDS[kind] ? kind : null,
    p_search: term || null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) return <ErrorState description="تعذّر تحميل المدفوعات" />;

  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (patch: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    if (term) params.set('q', term);
    if (status) params.set('status', status);
    if (kind) params.set('kind', kind);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, String(v));
    }
    return `/admin/payments?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">المدفوعات</h1>
        <p className="text-sm text-sand-600 tabular">
          {formatNumber(total)} دفعة — سجل للقراءة، لا يُعدَّل من هنا.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/admin/payments">
        <input name="q" defaultValue={term} maxLength={60}
               placeholder="المرجع أو المتجر أو رقم الطلب" aria-label="بحث في المدفوعات"
               className="h-10 min-w-52 flex-1 rounded-[--radius-md] border
                          border-[--color-field-border] bg-white px-3 text-[14px] text-navy-900
                          placeholder:text-sand-400 focus:border-nile-500" />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="kind" value={kind} />
        <Button type="submit" variant="outline" size="sm">بحث</Button>
      </form>

      <div className="flex flex-wrap gap-4">
        <nav className="flex gap-1.5" aria-label="تصفية النوع">
          <Link href={qs({ kind: null, page: null })} className={chip(!kind)}>كل الأنواع</Link>
          {Object.entries(KINDS).map(([value, label]) => (
            <Link key={value} href={qs({ kind: value, page: null })}
                  className={chip(kind === value)}>{label}</Link>
          ))}
        </nav>
        <nav className="flex gap-1.5" aria-label="تصفية الحالة">
          <Link href={qs({ status: null, page: null })} className={chip(!status)}>كل الحالات</Link>
          {STATUSES.map((value) => (
            <Link key={value} href={qs({ status: value, page: null })}
                  className={chip(status === value)}>
              {PAYMENT_STATUS[value]?.label ?? value}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<CreditCard size={36} strokeWidth={1.5} />}
                    title="لا مدفوعات مطابقة" />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-sand-200">
            {rows.map((p) => (
              <li key={p.payment_id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-navy-900">
                    {p.store_name ?? '—'}
                    <span className="ms-2 text-xs font-medium text-sand-600">
                      {KINDS[p.kind] ?? p.kind}
                      {p.order_number && ` · ${p.order_number}`}
                    </span>
                  </p>
                  <p className="truncate text-xs text-sand-600">
                    {PAYMENT_METHOD[p.method] ?? p.method}
                    {p.reference && <span dir="ltr"> · {p.reference}</span>}
                    {' · '}{formatDateTime(p.paid_at ?? p.created_at)}
                  </p>
                </div>
                <span className="font-extrabold tabular text-navy-900">
                  {formatMoney(p.amount)}
                </span>
                <StatusChip map={PAYMENT_STATUS} value={p.status} />
              </li>
            ))}
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
          <span className="text-sm text-sand-600 tabular">صفحة {page} من {pages}</span>
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
    ? 'border-nile-500 bg-nile-500 text-white'
    : 'border-sand-300 bg-white text-sand-700 hover:border-nile-400'}`;
