import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Heart, Package, ShoppingBag } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { rpc } from '@/lib/supabase/rpc';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { buttonClass } from '@/components/ui/Button';
import { StoreSignOut } from '@/components/storefront/StoreSignOut';
import { ORDER_STATUS } from '@/lib/status';
import { formatDate, formatMoney, formatNumber } from '@/lib/money/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'حسابي',
  robots: { index: false, follow: false },
};

/**
 * حساب العميل في المتجر.
 *
 * ★ يعرض ما هو مبنيّ خلفيًا فعلًا: طلبات هذا المتجر عبر
 * `my_orders(store_id)` المقصورة على `authenticated`، ورابط
 * المفضّلة. لا صفحة عناوين هنا لأن لا مسار خادمي لها بعد — وصفحة
 * تعد بما لا تحفظه أسوأ من غيابها.
 *
 * ★ `store_id` يُشتقّ من الـhost ويُمرَّر خادميًا. وRLS تضمن أن
 * الطلبات المعادة طلبات هذا المستخدم في هذا المتجر وحده.
 */
export default async function StoreAccountPage(
  { params }: PageProps<'/sites/[host]/account'>,
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login?next=/account');

  const supabase = await createClient();
  const { data: orders } = await rpc(supabase, 'my_orders', {
    p_store_id: store.storeId,
  });
  const list = orders ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink-900">حسابي</h1>
          <p className="mt-0.5 text-[14px] text-ink-500">
            {actor.fullName ? `${actor.fullName} · ` : ''}{store.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/wishlist" className={buttonClass('outline', 'sm')}>
            <Heart size={15} aria-hidden />المفضّلة
          </Link>
          <StoreSignOut />
        </div>
      </header>

      <Card className="mt-6">
        <CardHeader title="طلباتي" description={`طلباتك في ${store.name}`} />
        {list.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<ShoppingBag size={34} strokeWidth={1.5} />}
              title="لا طلبات بعد"
              description="ما تطلبه من هذا المتجر يظهر هنا."
              action={
                <Link href="/products" className={buttonClass('primary', 'sm')}>
                  تصفّح المنتجات
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {list.map((o) => (
              <li key={o.order_id}>
                <Link href={`/order?number=${encodeURIComponent(o.order_number)}`}
                      className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-ink-50">
                  <Package size={17} className="shrink-0 text-ink-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium tabular text-ink-900">
                      #{o.order_number}
                    </span>
                    <span className="block text-[12px] tabular text-ink-500">
                      {formatDate(o.created_at)} · {formatNumber(o.item_count)} صنفًا
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
    </div>
  );
}
