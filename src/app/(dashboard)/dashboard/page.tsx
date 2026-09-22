import Link from 'next/link';
import type { Metadata } from 'next';
import { Package, ShoppingCart } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/authz/guards';
import { StatCard } from '@/components/ui/Card';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { StatusChip } from '@/components/ui/Badge';
import { ORDER_STATUS } from '@/lib/status';
import { formatMoney, formatDate } from '@/lib/money/format';

export const metadata: Metadata = { title: 'لوحة التحكم' };

export default async function DashboardHome() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const membership = actor.stores[0];
  if (!membership) redirect('/onboarding');

  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  // RLS تضمن أن كل هذه الأرقام من متجر هذا العضو فقط
  const [orders, products, lowStock] = await Promise.all([
    supabase.from('orders')
      .select('id, order_number, status, total, created_at, contact_name')
      .eq('store_id', membership.storeId)
      .order('created_at', { ascending: false }).limit(5),
    supabase.from('products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', membership.storeId).is('deleted_at', null),
    supabase.from('inventory')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', membership.storeId).lte('quantity', 5),
  ]);

  const { data: monthOrders } = await supabase
    .from('orders')
    .select('total, status')
    .eq('store_id', membership.storeId)
    .gte('created_at', monthStart.toISOString());

  const revenue = (monthOrders ?? [])
    .filter((o) => o.status === 'completed')
    .reduce((sum, o) => sum + Number(o.total), 0);
  const newOrders = (orders.data ?? []).filter((o) => o.status === 'new').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">
          أهلًا{actor.fullName ? `، ${actor.fullName.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-ink-500">ملخص متجرك اليوم.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {can(membership, 'orders:view') && (
          <>
            <StatCard label="طلبات هذا الشهر"
                      value={String(monthOrders?.length ?? 0)} />
            <StatCard label="مبيعات مكتملة" value={formatMoney(revenue)} tone="gold" />
            <StatCard label="طلبات جديدة" value={String(newOrders)}
                      hint={newOrders > 0 ? 'بانتظار التأكيد' : undefined} />
          </>
        )}
        {can(membership, 'products:view') && (
          <StatCard label="المنتجات" value={String(products.count ?? 0)}
                    hint={lowStock.count ? `${lowStock.count} قارب على النفاد` : undefined} />
        )}
      </div>

      {can(membership, 'orders:view') && (
        <Card>
          <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
            <h2 className="font-bold text-ink-900">أحدث الطلبات</h2>
            <Link href="/dashboard/orders" className="text-sm font-bold text-teal-700 hover:underline">
              عرض الكل
            </Link>
          </div>

          {!orders.data || orders.data.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<ShoppingCart size={32} strokeWidth={1.5} />}
                title="لا توجد طلبات بعد"
                description="ستظهر طلبات عملائك هنا فور وصولها."
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink-200">
              {orders.data.map((o) => (
                <li key={o.id}>
                  <Link href={`/dashboard/orders/${o.id}`}
                        className="flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-ink-900 tabular">{o.order_number}</p>
                      <p className="truncate text-xs text-ink-500">
                        {o.contact_name} · {formatDate(o.created_at)}
                      </p>
                    </div>
                    <span className="font-bold text-ink-900 tabular">{formatMoney(o.total)}</span>
                    <StatusChip map={ORDER_STATUS} value={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!can(membership, 'orders:view') && !can(membership, 'products:view') && (
        <EmptyState
          icon={<Package size={32} strokeWidth={1.5} />}
          title="لا توجد أقسام متاحة لدورك"
          description="راجع مالك المتجر لمنحك الصلاحيات التي تحتاجها."
        />
      )}
    </div>
  );
}
