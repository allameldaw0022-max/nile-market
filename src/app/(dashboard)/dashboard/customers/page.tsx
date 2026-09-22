import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { formatDate, formatMoney, formatNumber } from '@/lib/money/format';
import { searchTerm, ilikeAny } from '@/lib/search';

export const metadata: Metadata = { title: 'العملاء' };

const PAGE_SIZE = 20;

export default async function CustomersPage(
  { searchParams }: PageProps<'/dashboard/customers'>,
) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'customers:view');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const term = searchTerm(sp.q);

  const supabase = await createClient();
  let query = supabase
    .from('customers')
    .select('id, name, phone, email, orders_count, total_spent, last_order_at, anonymized_at', { count: 'exact' })
    .eq('store_id', membership.storeId)
    .is('deleted_at', null);

  const search = ilikeAny(term, ['name', 'phone']);
  if (search) query = query.or(search);

  const { data: customers, count } = await query
    .order('last_order_at', { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const list = customers ?? [];
  const spentOnPage = list.reduce((sum, c) => sum + Number(c.total_spent), 0);
  const repeat = list.filter((c) => c.orders_count > 1).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">العملاء</h1>
        <p className="text-sm text-ink-500 tabular">{total} عميل</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="عملاء هذه الصفحة" value={formatNumber(list.length)} />
        <StatCard label="عملاء متكرّرون" value={formatNumber(repeat)} />
        <StatCard label="إنفاق هذه الصفحة" value={formatMoney(spentOnPage)} />
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/dashboard/customers">
        <input name="q" defaultValue={term} maxLength={60}
               placeholder="اسم أو رقم هاتف" aria-label="بحث في العملاء"
               className="h-10 min-w-52 flex-1 rounded-[--radius-md] border border-[--color-ink-400]
                          bg-white px-3 text-[14px] text-ink-900
                          placeholder:text-ink-400 focus:border-teal-600" />
        <Button type="submit" variant="outline" size="sm">بحث</Button>
      </form>

      {list.length === 0 ? (
        <EmptyState
          icon={<Users size={36} strokeWidth={1.5} />}
          title={term ? 'لا عملاء مطابقون' : 'لا عملاء بعد'}
          description={term
            ? 'جرّب اسمًا أو رقمًا آخر.'
            : 'يُنشأ سجل العميل تلقائيًا مع أول طلب.'}
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-ink-200">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/dashboard/customers/${c.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5
                                 hover:bg-ink-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-ink-900">
                      {c.anonymized_at ? 'عميل محذوف' : (c.name ?? 'بلا اسم')}
                    </p>
                    {c.phone && !c.anonymized_at && (
                      <p className="text-xs tabular text-ink-500" dir="ltr">{c.phone}</p>
                    )}
                  </div>
                  <span className="text-xs text-ink-500 tabular">
                    {c.orders_count} طلب
                  </span>
                  <span className="font-bold tabular text-ink-900">
                    {formatMoney(c.total_spent)}
                  </span>
                  <span className="text-xs text-ink-500">
                    {c.last_order_at ? formatDate(c.last_order_at) : '—'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="ترقيم الصفحات">
          {page > 1 && (
            <Link href={`/dashboard/customers?page=${page - 1}${term ? `&q=${encodeURIComponent(term)}` : ''}`}>
              <Button variant="outline" size="sm">السابق</Button>
            </Link>
          )}
          <span className="text-sm text-ink-500 tabular">صفحة {page} من {pages}</span>
          {page < pages && (
            <Link href={`/dashboard/customers?page=${page + 1}${term ? `&q=${encodeURIComponent(term)}` : ''}`}>
              <Button variant="outline" size="sm">التالي</Button>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
