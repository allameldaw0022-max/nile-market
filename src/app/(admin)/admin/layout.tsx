import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity, BadgeCheck, BarChart3, CreditCard, FileClock, Flag, Handshake,
  LayoutDashboard, LifeBuoy, Package, Settings, ShieldCheck, Store,
  Undo2, UserCog, Users, Wallet,
} from 'lucide-react';
import { getActor, adminHasLevel } from '@/lib/auth/actor';
import { Badge } from '@/components/ui/Badge';
import { NotificationBell } from '@/components/dashboard/NotificationBell';
import { createClient } from '@/lib/supabase/server';
import type { AdminSection } from '@/lib/authz/permissions';
import { SkipLink } from '@/components/ui/SkipLink';

/**
 * لوحة إدارة المنصة.
 *
 * ★ MFA إلزامي (D28): الحارس يشترط `aal2` لكل صفحة هنا، لا لصفحة
 * الدخول وحدها. جلسة بعامل واحد تُردّ إلى مركز الأمان.
 *
 * ★ التنقّل يُبنى من صلاحيات الموظف، لكن الإخفاء تحسين تجربة فقط:
 * كل صفحة تعيد فحص صلاحيتها، وكل دالة قاعدة تفحصها من جديد.
 */

type NavItem = { href: string; label: string; icon: typeof Store; section: AdminSection };

const NAV: NavItem[] = [
  { href: '/admin', label: 'نظرة عامة', icon: LayoutDashboard, section: 'dashboard' },
  { href: '/admin/stores', label: 'المتاجر', icon: Store, section: 'stores' },
  { href: '/admin/subscriptions', label: 'الاشتراكات', icon: BadgeCheck, section: 'subscriptions' },
  { href: '/admin/payments', label: 'المدفوعات', icon: CreditCard, section: 'payments' },
  { href: '/admin/refunds', label: 'الاستردادات', icon: Undo2, section: 'payments' },
  { href: '/admin/plans', label: 'الباقات', icon: Package, section: 'plans' },
  { href: '/admin/partners', label: 'الشركاء', icon: Handshake, section: 'partners' },
  { href: '/admin/payouts', label: 'الصرف', icon: Wallet, section: 'payouts' },
  { href: '/admin/support', label: 'الدعم', icon: LifeBuoy, section: 'support' },
  { href: '/admin/users', label: 'المستخدمون', icon: Users, section: 'users' },
  { href: '/admin/employees', label: 'الموظفون', icon: UserCog, section: 'settings' },
  { href: '/admin/reports', label: 'التقارير', icon: BarChart3, section: 'reports' },
  { href: '/admin/audit', label: 'سجل التدقيق', icon: FileClock, section: 'audit_logs' },
  { href: '/admin/flags', label: 'الميزات', icon: Flag, section: 'feature_flags' },
  { href: '/admin/health', label: 'صحة النظام', icon: Activity, section: 'system_health' },
  { href: '/admin/settings', label: 'الإعدادات', icon: Settings, section: 'settings' },
];

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login?next=/admin');
  // ليس موظف منصة ⇒ لا نؤكد وجود اللوحة أصلًا
  if (!actor.admin) redirect('/');

  // ★ D28: الإدارة بعاملين. الفحص هنا وفي كل حارس صفحة.
  if (actor.admin.mfaRequired && actor.aal !== 'aal2') {
    redirect('/account/security?reason=admin_mfa');
  }

  const items = NAV.filter((i) => adminHasLevel(actor, i.section, 'view'));

  const supabase = await createClient();
  const { count: unread } = await supabase
    .from('notifications').select('id', { count: 'exact', head: true })
    .is('read_at', null);

  return (
    <div className="flex min-h-screen flex-col bg-sand-50">
      <SkipLink />
      <header className="sticky top-0 z-40 border-b border-navy-700 bg-navy-900">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/admin"
                className="inline-flex items-center gap-2 font-extrabold text-white">
            <ShieldCheck size={20} className="text-gold-500" />
            إدارة نايل ماركت
          </Link>

          <Badge tone="gold" className="hidden sm:inline-flex">
            {actor.admin.isOwner ? 'مالك المنصة' : 'موظف'}
          </Badge>

          <div className="ms-auto flex items-center gap-2">
            <div className="rounded-[--radius-md] bg-white/10">
              <NotificationBell initialUnread={unread ?? 0} />
            </div>
            <Link href="/dashboard"
                  className="rounded-[--radius-md] px-3 py-1.5 text-[13px] font-bold
                             text-white/80 hover:bg-white/10 hover:text-white">
              الخروج من الإدارة
            </Link>
          </div>
        </div>

        <nav className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 no-scrollbar">
            {items.map((item) => (
              <Link key={item.href} href={item.href}
                    className="flex shrink-0 items-center gap-1.5 px-3 py-3 text-[13px]
                               font-bold text-white/70 hover:text-white">
                <item.icon size={15} />
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
