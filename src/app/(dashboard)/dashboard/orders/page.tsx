import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ShoppingCart } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { StatusChip } from '@/components/ui/Badge';
import { ORDER_STATUS, PAYMENT_STATUS } from '@/lib/status';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/money/format';
import { searchTerm, ilikeAny } from '@/lib/search';

export const metadata: Metadata = { title: 'الطلبات' };

const PAGE_SIZE = 20;
const STATUSES = ['new', 'confirmed', 'preparing', 'shipped', 'completed', 'cancelled'] as const;
type OrderStatus = (typeof STATUSES)[number];

const isStatus = (v: string): v is OrderStatus =>
  (STATUSES as readonly string[]).includes(v);

// الاختيار مبني بتجميع نصوص، فلا يستنتج PostgREST شكل الصف منه
type OrderRow = {
  id: string; order_number: string; status: string; payment_status: string;
  total: number; contact_name: string; contact_phone: string; created_at: string;
};

export default async function OrdersPage({ searchParams }: PageProps<'/dashboard/orders'>) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'orders:view');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const status = typeof sp.status === 'string' ? sp.status : '';
  const term = searchTerm(sp.q);

  const supabase = await createClient();

  let query = supabase
    .from('orders')
    .select('id, order_number, status, payment_status, total, contact_name, ' +
            'contact_phone, created_at', { count: 'exact' })
    .eq('store_id', membership.storeId);

  if (isStatus(status)) query = query.eq('status', status);
  const search = ilikeAny(term, ['order_number', 'contact_phone', 'contact_name']);
  if (search) {
    query = query.or(search);
  }

  const [{ data: orderRows, count }, { data: openRows }] = await Promise.all([
    query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1),
    // عدّادات الحالات المفتوحة — استعلام خفيف بلا صفوف
    supabase.from('orders').select('status, payment_status, total')
      .eq('store_id', membership.storeId)
      .in('status', ['new', 'confirmed', 'preparing', 'shipped'])
      .limit(500),
  ]);

  const orders = (orderRows ?? []) as unknown as OrderRow[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const open = openRows ?? [];
  const newCount = open.filter((o) => o.status === 'new').length;
  const unpaidCount = open.filter(
    (o) => o.payment_status === 'unpaid' || o.payment_status === 'partially_paid').length;
  const openValue = open.reduce((sum, o) => sum + Number(o.total), 0);

  const qs = (patch: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    if (term) params.set('q', term);
    if (status) params.set('status', status);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') params.delete(k);
      else params.set(k, String(v));
    }
    return `/dashboard/orders?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">الطلبات</h1>
        <p className="text-sm text-sand-600 tabular">{total} طلب</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="طلبات جديدة" value={formatNumber(newCount)} tone="gold" />
        <StatCard label="بانتظار الدفع" value={formatNumber(unpaidCount)} />
        <StatCard label="قيمة الطلبات المفتوحة" value={formatMoney(openValue)} />
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/dashboard/orders">
        <input name="q" defaultValue={term} maxLength={60}
               placeholder="رقم الطلب أو اسم/هاتف الزبون" aria-label="بحث في الطلبات"
               className="h-10 min-w-52 flex-1 rounded-[--radius-md] border border-[--color-field-border]
                          bg-white px-3 text-[14px] text-navy-900
                          placeholder:text-sand-400 focus:border-nile-500" />
        <input type="hidden" name="status" value={status} />
        <Button type="submit" variant="outline" size="sm">بحث</Button>
      </form>

      <nav className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1" aria-label="تصفية الحالة">
        <Link href={qs({ status: null, page: null })}
              aria-current={!status ? 'page' : undefined}
              className={chip(!status)}>الكل</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={qs({ status: s, page: null })}
                aria-current={status === s ? 'page' : undefined}
                className={chip(status === s)}>
            {ORDER_STATUS[s].label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart size={36} strokeWidth={1.5} />}
          title={status || term ? 'لا طلبات مطابقة' : 'لا طلبات بعد'}
          description={status || term
            ? 'جرّب تصفية أخرى.'
            : 'ستظهر طلبات زبائنك هنا فور وصولها.'}
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-sand-200">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/dashboard/orders/${o.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5
                                 hover:bg-sand-50">
                  <span className="font-extrabold tabular text-navy-900" dir="ltr">
                    {o.order_number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-navy-900">{o.contact_name}</p>
                    <p className="text-xs text-sand-600 tabular" dir="ltr">
                      {o.contact_phone}
                    </p>
                  </div>
                  <span className="text-xs text-sand-600">
                    {formatDateTime(o.created_at)}
                  </span>
                  <span className="font-bold tabular text-navy-900">
                    {formatMoney(o.total)}
                  </span>
                  <StatusChip map={PAYMENT_STATUS} value={o.payment_status} />
                  <StatusChip map={ORDER_STATUS} value={o.status} />
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
