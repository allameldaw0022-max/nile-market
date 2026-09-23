import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { can } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { SUBSCRIPTION_STATUS } from '@/lib/status';
import { Badge } from '@/components/ui/Badge';
import { NotificationBell } from '@/components/dashboard/NotificationBell';
import { GlobalSearch } from '@/components/dashboard/GlobalSearch';
import { NavDrawer, SideNav } from '@/components/dashboard/SideNav';
import { StoreMenu } from '@/components/dashboard/StoreMenu';
import { AccountMenu } from '@/components/dashboard/AccountMenu';
import { SkipLink } from '@/components/ui/SkipLink';
import { NAV_GROUPS } from '@/lib/dashboard-nav';

const ROLE_LABEL: Record<string, string> = {
  owner: 'المالك', manager: 'مدير', orders: 'موظّف طلبات',
  products: 'موظّف منتجات', customer_service: 'خدمة عملاء',
};

export default async function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  if (actor.stores.length === 0) redirect('/onboarding');

  // متجر واحد لكل جلسة في V1 — أول عضوية نشطة
  const membership = actor.stores[0];

  const supabase = await createClient();
  const [{ data: sub }, { data: domain }, { count: unread }] = await Promise.all([
    supabase.from('subscriptions')
      .select('status, current_period_end, plans(name)')
      .eq('store_id', membership.storeId).neq('status', 'cancelled').maybeSingle(),
    supabase.from('store_domains')
      .select('hostname').eq('store_id', membership.storeId)
      .eq('is_primary', true).maybeSingle(),
    // RLS ترشّح على المستخدم الحالي — لا تمرير لمعرّفه من الواجهة
    supabase.from('notifications')
      .select('id', { count: 'exact', head: true }).is('read_at', null),
  ]);

  // التنقّل يُبنى من الصلاحيات — لكن الإخفاء تحسين تجربة فقط،
  // والمنع الحقيقي في الحارس الخادمي داخل كل صفحة وServer Action.
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, links: g.links.filter((l) => !l.perm || can(membership, l.perm)) }))
    .filter((g) => g.links.length > 0);

  const searchScopes = [
    can(membership, 'orders:view') && 'orders',
    can(membership, 'products:view') && 'products',
    can(membership, 'customers:view') && 'customers',
  ].filter(Boolean) as string[];

  const subStatus = sub?.status ?? 'expired';
  const needsAttention = ['expiring', 'grace', 'expired', 'suspended'].includes(subStatus);

  return (
    <div className="min-h-screen bg-ink-50">
      <SkipLink />

      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-3 px-4">
          <NavDrawer groups={groups} storeName={membership.storeName} />

          <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-bold text-ink-900">
              {membership.storeName}
            </span>
            <Badge tone="neutral" className="hidden shrink-0 sm:inline-flex">
              {ROLE_LABEL[membership.role] ?? membership.role}
            </Badge>
          </Link>

          <div className="mx-2 hidden max-w-md flex-1 md:flex">
            <GlobalSearch allowed={searchScopes} />
          </div>

          <div className="ms-auto flex shrink-0 items-center gap-2">
            <NotificationBell initialUnread={unread ?? 0} />
            {domain?.hostname && (
              <StoreMenu hostname={domain.hostname} storeName={membership.storeName} />
            )}
            <AccountMenu email={actor.email} isPlatformStaff={Boolean(actor.admin)} />
          </div>
        </div>
      </header>

      {needsAttention && (
        <div className="border-b border-gold-500/30 bg-gold-50">
          <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-2 px-4 py-2.5 text-[13px]">
            <Badge tone={SUBSCRIPTION_STATUS[subStatus]?.tone ?? 'warning'}>
              {SUBSCRIPTION_STATUS[subStatus]?.label ?? subStatus}
            </Badge>
            <span className="text-ink-700">
              {subStatus === 'expired' || subStatus === 'suspended'
                ? 'الشراء من متجرك متوقّف حاليًا. بياناتك ومنتجاتك وطلباتك محفوظة بالكامل.'
                : 'اشتراكك يقارب الانتهاء — جدّد لتبقى كل الميزات متاحة.'}
            </span>
            {can(membership, 'subscription:manage') && (
              <Link href="/dashboard/subscription"
                    className="font-semibold text-teal-700 underline underline-offset-4">
                تجديد الاشتراك
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ★ عمود ثابت على الشاشات الواسعة، ودرج على الضيّقة. الشبكة
          تُعرّف مرّة هنا فلا تعيد كل صفحة بناء هيكلها. */}
      <div className="mx-auto flex max-w-[90rem] gap-8 px-4">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0
                          overflow-y-auto border-s border-ink-200 py-6 ps-0 pe-4 lg:block">
          <SideNav groups={groups} />
        </aside>

        <main id="main" className="min-w-0 flex-1 py-6">{children}</main>
      </div>
    </div>
  );
}
