'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Settings, TrendingUp, Wallet } from 'lucide-react';

const LINKS = [
  { href: '/partner',             label: 'الرئيسية',  icon: LayoutDashboard },
  { href: '/partner/commissions', label: 'العمولات',  icon: TrendingUp },
  { href: '/partner/payouts',     label: 'مستحقاتي',  icon: Wallet },
  { href: '/partner/settings',    label: 'الإعدادات', icon: Settings },
] as const;

/** تنقّل الشريك — أفقي وقابل للتمرير على الهاتف. */
export function PartnerNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="أقسام الشريك"
         className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-3 pb-2">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = href === '/partner'
          ? pathname === '/partner'
          : pathname.startsWith(href);
        return (
          <Link key={href} href={href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full
                            px-3 py-1.5 text-[13px] font-bold ${active
                              ? 'bg-teal-600 text-white'
                              : 'text-ink-600 hover:bg-ink-100'}`}>
            <Icon size={14} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
