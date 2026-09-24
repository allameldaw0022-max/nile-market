import Link from 'next/link';
import type { Metadata } from 'next';
import { Store } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { adminHasLevel, getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { StatusChip } from '@/components/ui/Badge';
import { StoreStatusActions } from '@/components/admin/StoreStatusActions';
import { STORE_STATUS, SUBSCRIPTION_STATUS } from '@/lib/status';
import { formatDate } from '@/lib/money/format';
import { searchTerm, ilikeAny } from '@/lib/search';

export const metadata: Metadata = {
  title: 'المتاجر — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

type StoreRow = {
  id: string; name: string; slug: string; status: string;
  created_at: string; suspended_reason: string | null;
  subscriptions: { status: string; current_period_end: string | null }[] | null;
};

export default async function AdminStoresPage(
  { searchParams }: PageProps<'/admin/stores'>,
) {
  await requirePlatformAccess('stores', 'view');
  const actor = await getActor();
  const canEdit = actor.kind === 'user' && adminHasLevel(actor, 'stores', 'edit');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const term = searchTerm(sp.q);
  const status = typeof sp.status === 'string' ? sp.status : '';

  const supabase = await createClient();
  let query = supabase
    .from('stores')
    .select('id, name, slug, status, created_at, suspended_reason, subscriptions(status, current_period_end)',
            { count: 'exact' })
    .is('deleted_at', null);

  const search = ilikeAny(term, ['name', 'slug']);
  if (search) query = query.or(search);
  // القيمة تُطابَق على قائمة معروفة قبل استخدامها في الاستعلام
  if (isStoreStatus(status)) query = query.eq('status', status);

  const { data, count } = await query
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const rows = (data ?? []) as unknown as StoreRow[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (patch: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    if (term) params.set('q', term);
    if (status) params.set('status', status);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, String(v));
    }
    return `/admin/stores?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">المتاجر</h1>
        <p className="text-sm text-ink-500 tabular">{total} متجر</p>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/admin/stores">
        <input name="q" defaultValue={term} maxLength={60}
               placeholder="اسم المتجر أو رابطه" aria-label="بحث في المتاجر"
               className="h-10 min-w-52 flex-1 rounded-md border
                          border-ink-400 bg-white px-3 text-[14px] text-ink-900
                          placeholder:text-ink-500 focus:border-teal-600" />
        <input type="hidden" name="status" value={status} />
        <Button type="submit" variant="outline" size="sm">بحث</Button>
      </form>

      <nav className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1"
           aria-label="تصفية الحالة">
        <Link href={qs({ status: null, page: null })}
              className={chip(!status)}>الكل</Link>
        {Object.entries(STORE_STATUS).map(([value, s]) => (
          <Link key={value} href={qs({ status: value, page: null })}
                className={chip(status === value)}>{s.label}</Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={<Store size={36} strokeWidth={1.5} />}
                    title="لا متاجر مطابقة" />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-ink-200">
            {rows.map((s) => {
              const sub = s.subscriptions?.[0];
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-3
                                          px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    {/* ★ اسم المتجر مدخل إلى ملفه: صاحبه ورقمه
                        وباقته ونشاطه، ومنه زرّ فتح واجهته. */}
                    <Link href={`/admin/stores/${s.id}`}
                          className="block truncate font-bold text-ink-900
                                     hover:text-teal-700">
                      {s.name}
                    </Link>
                    <p className="text-xs text-ink-500" dir="ltr">
                      {s.slug} · {formatDate(s.created_at)}
                    </p>
                    {s.suspended_reason && (
                      <p className="text-xs text-danger">
                        سبب الإيقاف: {s.suspended_reason}
                      </p>
                    )}
                  </div>

                  {sub && (
                    <StatusChip map={SUBSCRIPTION_STATUS} value={sub.status} />
                  )}
                  <StatusChip map={STORE_STATUS} value={s.status} />

                  {canEdit && s.status !== 'closed' && (
                    <StoreStatusActions storeId={s.id} status={s.status} />
                  )}
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

const STATUSES = ['draft', 'pending_review', 'active', 'closed', 'suspended'] as const;
type StoreStatusValue = (typeof STATUSES)[number];

function isStoreStatus(value: string): value is StoreStatusValue {
  return (STATUSES as readonly string[]).includes(value);
}

const chip = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${active
    ? 'border-teal-600 bg-teal-600 text-white'
    : 'border-ink-300 bg-white text-ink-600 hover:border-teal-400'}`;
