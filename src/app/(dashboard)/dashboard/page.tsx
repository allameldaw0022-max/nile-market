import Link from 'next/link';
import type { Metadata } from 'next';
import { Package, Plus, ShoppingCart, TriangleAlert } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/authz/guards';
import { Card, CardHeader, StatCard } from '@/components/ui/Card';
import { BarChart } from '@/components/ui/Chart';
import { EmptyState } from '@/components/ui/States';
import { StatusChip } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { ORDER_STATUS } from '@/lib/status';
import { formatDate, formatMoney, formatNumber } from '@/lib/money/format';

export const metadata: Metadata = { title: 'لوحة التحكم' };

const DAYS = 14;

/**
 * الشاشة الرئيسية للتاجر.
 *
 * ★ ما يفتحه التاجر كل صباح ليعرف ثلاثة أشياء: هل وصل طلب جديد؟ كم
 * بعت؟ هل شيء على وشك النفاد؟ فهذه الثلاثة أعلى الصفحة، وما دونها
 * تفصيل. ترتيب العناصر هنا قرار منتج لا قرار تخطيط.
 *
 * ★ كل رقم من القاعدة وRLS تضمن أنه من متجر هذا العضو وحده. وما لا
 * يملك العضو صلاحيته لا يُعرض له فارغًا بل لا يُعرض أصلًا.
 */
export default async function DashboardHome() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const membership = actor.stores[0];
  if (!membership) redirect('/onboarding');

  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const since = new Date();
  since.setDate(since.getDate() - (DAYS - 1));
  since.setHours(0, 0, 0, 0);

  const [orders, products, lowStock, series] = await Promise.all([
    supabase.from('orders')
      .select('id, order_number, status, total, created_at, contact_name')
      .eq('store_id', membership.storeId)
      .order('created_at', { ascending: false }).limit(6),
    supabase.from('products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', membership.storeId).is('deleted_at', null),
    supabase.from('inventory')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', membership.storeId).lte('quantity', 5),
    supabase.from('orders')
      .select('total, status, created_at')
      .eq('store_id', membership.storeId)
      .gte('created_at', since.toISOString()),
  ]);

  const { data: monthOrders } = await supabase
    .from('orders').select('total, status')
    .eq('store_id', membership.storeId)
    .gte('created_at', monthStart.toISOString());

  const revenue = (monthOrders ?? [])
    .filter((o) => o.status === 'completed')
    .reduce((sum, o) => sum + Number(o.total), 0);
  const newOrders = (orders.data ?? []).filter((o) => o.status === 'new').length;

  // سلسلة أربعة عشر يومًا — الأيام الخالية أصفار لا فجوات، وإلا بدا
  // الرسم وكأن المتجر باع كل يوم.
  const byDay = new Map<string, number>();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(since); d.setDate(since.getDate() + i);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const o of series.data ?? []) {
    if (o.status !== 'completed') continue;
    const k = String(o.created_at).slice(0, 10);
    if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + Number(o.total));
  }
  const chart = [...byDay.entries()].map(([k, v]) => ({
    label: formatDate(k), value: v,
  }));
  const hasSales = chart.some((p) => p.value > 0);

  const seesOrders = can(membership, 'orders:view');
  const seesProducts = can(membership, 'products:view');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink-900">
            أهلًا{actor.fullName ? `، ${actor.fullName.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-0.5 text-[14px] text-ink-500">هذه حال متجرك اليوم.</p>
        </div>
        <div className="flex gap-2">
          {seesProducts && can(membership, 'products:create') && (
            <Link href="/dashboard/products/new" className={buttonClass('primary', 'sm')}>
              <Plus size={15} aria-hidden />منتج جديد
            </Link>
          )}
          {seesOrders && (
            <Link href="/dashboard/orders" className={buttonClass('outline', 'sm')}>
              كل الطلبات
            </Link>
          )}
        </div>
      </header>

      {seesProducts && (lowStock.count ?? 0) > 0 && (
        <Link href="/dashboard/inventory?low=1"
              className="flex items-center gap-2.5 rounded-[--radius-md] border border-gold-500/40
                         bg-gold-50 px-4 py-3 text-[14px] text-ink-900 transition-colors
                         hover:border-gold-500">
          <TriangleAlert size={17} className="shrink-0 text-gold-700" aria-hidden />
          <span><span className="font-semibold tabular">{formatNumber(lowStock.count ?? 0)}</span>
            {' '}منتجًا قارب على النفاد — راجع المخزون قبل أن يطلبه عميل.</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {seesOrders && (
          <>
            <StatCard label="طلبات هذا الشهر" value={formatNumber(monthOrders?.length ?? 0)} />
            <StatCard label="مبيعات مكتملة" value={formatMoney(revenue)} tone="gold" />
            <StatCard label="طلبات جديدة" value={formatNumber(newOrders)}
                      hint={newOrders > 0 ? 'بانتظار التأكيد' : 'لا شيء ينتظرك'} />
          </>
        )}
        {seesProducts && (
          <StatCard label="المنتجات" value={formatNumber(products.count ?? 0)}
                    hint={lowStock.count ? `${formatNumber(lowStock.count)} قارب على النفاد` : undefined} />
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        {seesOrders && (
          <Card>
            <CardHeader title="المبيعات المكتملة" description={`آخر ${formatNumber(DAYS)} يومًا`} />
            <div className="p-5">
              {hasSales ? (
                <BarChart data={chart} format={formatMoney} height={180}
                          label={`المبيعات اليومية لآخر ${DAYS} يومًا`} />
              ) : (
                <p className="py-10 text-center text-[14px] text-ink-500">
                  لا مبيعات مكتملة في هذه الفترة بعد.
                </p>
              )}
            </div>
          </Card>
        )}

        {seesOrders && (
          <Card>
            <CardHeader title="أحدث الطلبات" action={
              <Link href="/dashboard/orders"
                    className="text-[13px] font-medium text-teal-700 underline underline-offset-4">
                عرض الكل
              </Link>
            } />
            {!orders.data || orders.data.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<ShoppingCart size={32} strokeWidth={1.5} />}
                  title="لا توجد طلبات بعد"
                  description="ستظهر طلبات عملائك هنا فور وصولها."
                />
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {orders.data.map((o) => (
                  <li key={o.id}>
                    <Link href={`/dashboard/orders/${o.id}`}
                          className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ink-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-ink-900">
                          {o.contact_name}
                        </span>
                        <span className="block text-[12px] tabular text-ink-500">
                          #{o.order_number} · {formatDate(o.created_at)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[14px] font-semibold tabular text-ink-900">
                        {formatMoney(o.total)}
                      </span>
                      <StatusChip map={ORDER_STATUS} value={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {!seesOrders && !seesProducts && (
        <EmptyState
          icon={<Package size={32} strokeWidth={1.5} />}
          title="لا توجد أقسام متاحة لدورك"
          description="راجع مالك المتجر لمنحك الصلاحيات التي تحتاجها."
        />
      )}
    </div>
  );
}
