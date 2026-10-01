import type { StorePermission } from '@/lib/authz/permissions';

export type NavLink = { href: string; label: string; perm?: StorePermission; exact?: boolean };
export type NavGroup = { title: string; links: NavLink[] };

/**
 * تنقّل لوحة التاجر.
 *
 * ★ كل رابط هنا يقابل صفحة موجودة فعلًا. لا رابط لميزة غير مبنية:
 * عنصر تنقّل يقود إلى 404 أسوأ من غيابه — يَعِد التاجر بما لا يجده.
 *
 * ★ التجميع بمهمّة التاجر لا بترتيب الملفّات: «البيع اليومي» أولًا
 * لأنه ما يفتحه كل صباح، و«إعدادات المتجر» آخرًا لأنها تُضبط مرّة.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'البيع اليومي',
    links: [
      { href: '/dashboard',           label: 'الرئيسية', exact: true },
      { href: '/dashboard/orders',    label: 'الطلبات',  perm: 'orders:view' },
      { href: '/dashboard/customers', label: 'العملاء',  perm: 'customers:view' },
    ],
  },
  {
    title: 'الكتالوج',
    links: [
      { href: '/dashboard/products',  label: 'المنتجات', perm: 'products:view' },
      { href: '/dashboard/inventory', label: 'المخزون',  perm: 'inventory:view' },
      { href: '/dashboard/coupons',   label: 'الخصومات', perm: 'orders:view' },
    ],
  },
  {
    title: 'النمو',
    links: [
      { href: '/dashboard/analytics', label: 'الإحصائيات', perm: 'analytics:view' },
    ],
  },
  {
    title: 'إعدادات المتجر',
    links: [
      { href: '/dashboard/settings',          label: 'عامّة',       perm: 'settings:view', exact: true },
      { href: '/dashboard/settings/delivery', label: 'التوصيل',     perm: 'settings:view' },
      { href: '/dashboard/settings/domain',   label: 'الدومين',     perm: 'settings:view' },
      { href: '/dashboard/settings/policies', label: 'سياسات المتجر', perm: 'settings:view' },
      { href: '/dashboard/settings/team',     label: 'الفريق',      perm: 'members:view' },
    ],
  },
  {
    title: 'الحساب',
    links: [
      { href: '/dashboard/subscription', label: 'الاشتراك', perm: 'subscription:manage' },
      { href: '/account/security',       label: 'الأمان' },
      { href: '/support',                label: 'الدعم' },
    ],
  },
];

/** هل هذا الرابط هو القسم المفتوح؟ */
export function isActive(pathname: string, link: NavLink): boolean {
  return link.exact ? pathname === link.href : pathname.startsWith(link.href);
}
