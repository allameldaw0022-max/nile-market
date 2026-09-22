import Link from 'next/link';
import type { Metadata } from 'next';
import { LifeBuoy } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, StatusChip } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { TICKET_STATUS } from '@/lib/status';
import { TICKET_CATEGORY_LABEL } from '@/lib/support/categories';
import { formatDateTime, formatNumber } from '@/lib/money/format';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'الدعم — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

const PRIORITY: Record<string, { label: string; tone: 'danger' | 'warning' | 'neutral' }> = {
  urgent: { label: 'عاجل',  tone: 'danger' },
  high:   { label: 'مرتفع', tone: 'warning' },
  normal: { label: 'عادي',  tone: 'neutral' },
  low:    { label: 'منخفض', tone: 'neutral' },
};

/**
 * طابور الدعم.
 *
 * ★ الترتيب في القاعدة لا هنا: المفتوح أولًا ثم الأولوية ثم آخر رسالة.
 * ترتيب الواجهة وحده يكذب حين تُقسَّم الصفحات.
 */
export default async function AdminSupportPage(
  { searchParams }: PageProps<'/admin/support'>,
) {
  await requirePlatformAccess('support', 'view');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const term = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 60);
  const status = typeof sp.status === 'string' ? sp.status : 'open';
  const mine = sp.mine === '1';

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'support_queue', {
    p_status: status === 'all' ? null : status,
    p_mine: mine,
    p_search: term || null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) return <ErrorState description="تعذّر تحميل تذاكر الدعم" />;

  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (patch: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    if (term) params.set('q', term);
    if (status) params.set('status', status);
    if (mine) params.set('mine', '1');
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, String(v));
    }
    return `/admin/support?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">تذاكر الدعم</h1>
        <p className="text-sm text-sand-600 tabular">{formatNumber(total)} تذكرة</p>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/admin/support">
        <input name="q" defaultValue={term} maxLength={60}
               placeholder="رقم التذكرة أو الموضوع أو الاسم" aria-label="بحث في التذاكر"
               className="h-10 min-w-52 flex-1 rounded-[--radius-md] border
                          border-sand-300 bg-white px-3 text-[14px] text-navy-900
                          placeholder:text-sand-400 focus:border-nile-500" />
        <input type="hidden" name="status" value={status} />
        {mine && <input type="hidden" name="mine" value="1" />}
        <Button type="submit" variant="outline" size="sm">بحث</Button>
      </form>

      <div className="flex flex-wrap gap-4">
        <nav className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1"
             aria-label="تصفية الحالة">
          <Link href={qs({ status: 'open', page: null })}
                className={chip(status === 'open')}>المفتوحة</Link>
          <Link href={qs({ status: 'all', page: null })}
                className={chip(status === 'all')}>الكل</Link>
          {Object.entries(TICKET_STATUS).map(([value, s]) => (
            <Link key={value} href={qs({ status: value, page: null })}
                  className={chip(status === value)}>{s.label}</Link>
          ))}
        </nav>
        <Link href={qs({ mine: mine ? null : 1, page: null })}
              className={chip(mine)}>المسنَدة لي</Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<LifeBuoy size={36} strokeWidth={1.5} />}
                    title="لا تذاكر مطابقة" />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-sand-200">
            {rows.map((t) => (
              <li key={t.ticket_id}>
                <Link href={`/admin/support/${t.ticket_id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5
                                 hover:bg-sand-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-navy-900">{t.subject}</p>
                    <p className="truncate text-xs text-sand-600">
                      <span dir="ltr" className="tabular">{t.ticket_number}</span>
                      {' · '}{TICKET_CATEGORY_LABEL[t.category] ?? t.category}
                      {' · '}{t.requester_name ?? 'بلا اسم'}
                      {t.store_name && ` · ${t.store_name}`}
                    </p>
                  </div>

                  {t.assigned_name && (
                    <span className="text-xs text-sand-600">{t.assigned_name}</span>
                  )}
                  <span className="text-xs text-sand-600">
                    {formatDateTime(t.last_message_at)}
                  </span>
                  <Badge tone={PRIORITY[t.priority]?.tone ?? 'neutral'}>
                    {PRIORITY[t.priority]?.label ?? t.priority}
                  </Badge>
                  <StatusChip map={TICKET_STATUS} value={t.status} />
                </Link>
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
