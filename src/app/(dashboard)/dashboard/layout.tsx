import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BarChart3, Boxes, CreditCard, ExternalLink, LayoutDashboard, LifeBuoy,
  Package, Settings, ShoppingCart, Tag, Users,
} from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { can } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { SUBSCRIPTION_STATUS } from '@/lib/status';
import { Badge } from '@/components/ui/Badge';
import { NotificationBell } from '@/components/dashboard/NotificationBell';
import type { StorePermission } from '@/lib/authz/permissions';

type NavItem = { href: string; label: string; icon: typeof Package; perm?: StorePermission };

const NAV: NavItem[] = [
  { href: '/dashboard',               label: 'الرئيسية',  icon: LayoutDashboard },
  { href: '/dashboard/products',      label: 'المنتجات',  icon: Package,      perm: 'products:view' },
  { href: '/dashboard/inventory',     label: 'المخزون',   icon: Boxes,        perm: 'inventory:view' },
  { href: '/dashboard/orders',        label: 'الطلبات',   icon: ShoppingCart, perm: 'orders:view' },
  { href: '/dashboard/customers',     label: 'العملاء',   icon: Users,        perm: 'customers:view' },
  { href: '/dashboard/coupons',       label: 'الخصومات',  icon: Tag,          perm: 'orders:view' },
  { href: '/dashboard/analytics',     label: 'الإحصائيات', icon: BarChart3,   perm: 'analytics:view' },
  { href: '/dashboard/subscription',  label: 'الاشتراك',  icon: CreditCard,   perm: 'subscription:manage' },
  { href: '/dashboard/settings',      label: 'الإعدادات', icon: Settings,     perm: 'settings:view' },
  { href: '/support',                 label: 'الدعم',     icon: LifeBuoy },
];

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
  const items = NAV.filter((i) => !i.perm || can(membership, i.perm));
  const subStatus = sub?.status ?? 'expired';
  const needsAttention = ['expiring', 'grace', 'expired', 'suspended'].includes(subStatus);

  return (
    <div className="flex min-h-screen flex-col bg-sand-50">
      <header className="sticky top-0 z-40 border-b border-sand-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/dashboard" className="truncate font-extrabold text-navy-900">
            {membership.storeName}
          </Link>
          <Badge tone="neutral" className="hidden sm:inline-flex">
            {{
              owner: 'المالك', manager: 'مدير', orders: 'موظف طلبات',
              products: 'موظف منتجات', customer_service: 'خدمة عملاء',
            }[membership.role]}
          </Badge>

          <div className="ms-auto flex items-center gap-2">
            <NotificationBell initialUnread={unread ?? 0} />
            {domain?.hostname && (
              <a href={`https://${domain.hostname}`} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 rounded-[--radius-md] border
                            border-sand-300 px-3 py-1.5 text-[13px] font-bold text-navy-700
                            hover:border-nile-500 hover:text-nile-600">
                <ExternalLink size={14} />
                <span className="hidden sm:inline">مشاهدة المتجر</span>
              </a>
            )}
          </div>
        </div>

        <nav className="border-t border-sand-200">
          <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 no-scrollbar">
            {items.map((item) => (
              <Link key={item.href} href={item.href}
                    className="flex shrink-0 items-center gap-1.5 px-3 py-3 text-[13px]
                               font-bold text-sand-600 hover:text-nile-600">
                <item.icon size={15} />
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      {needsAttention && (
        <div className="border-b border-gold-500/30 bg-gold-400/10 px-4 py-2.5">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 text-[13px]">
            <Badge tone={SUBSCRIPTION_STATUS[subStatus]?.tone ?? 'warning'}>
              {SUBSCRIPTION_STATUS[subStatus]?.label ?? subStatus}
            </Badge>
            <span className="text-navy-700">
              {subStatus === 'expired' || subStatus === 'suspended'
                ? 'الشراء من متجرك متوقف حاليًا. بياناتك ومنتجاتك وطلباتك محفوظة بالكامل.'
                : 'اشتراكك يقارب الانتهاء — جدّد لتبقى كل الميزات متاحة.'}
            </span>
            {can(membership, 'subscription:manage') && (
              <Link href="/dashboard/subscription"
                    className="font-bold text-nile-600 hover:underline">تجديد الاشتراك</Link>
            )}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
