'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Grid2x2, Home, Receipt, ShoppingCart, User } from 'lucide-react';
import { useViewer } from '../ViewerProvider';

const ITEMS = [
  { href: '/',            label: 'الرئيسية', icon: Home,         match: (p: string) => p === '/' },
  { href: '/products',    label: 'التصنيفات', icon: Grid2x2,      match: (p: string) => p.startsWith('/products') || p.startsWith('/categories') },
  { href: '/orders/track', label: 'الطلبات',  icon: Receipt,      match: (p: string) => p.startsWith('/orders') || p.startsWith('/order') },
  { href: '/cart',        label: 'السلة',    icon: ShoppingCart,  match: (p: string) => p.startsWith('/cart') },
  { href: '/account',     label: 'حسابي',    icon: User,          match: (p: string) => p.startsWith('/account') || p.startsWith('/login') },
] as const;

/**
 * شريط التنقّل السفلي — الهاتف وحده.
 *
 * ★ يستعمل المسارات القائمة حرفيًا: لا سلّة جديدة ولا حساب جديد ولا
 * صفحة طلبات ثانية. خمسة روابط إلى ما هو مبنيّ أصلًا.
 *
 * ★ عدّاد السلّة من `useViewer` (مسار `/viewer` غير المخزَّن) لا من
 * الخادم: قراءته في التصيير كانت تُخرج كل صفحة من التخزين.
 *
 * ★ و`safe-area-inset-bottom` ليس زخرفة: بدونه يختبئ الشريط خلف
 * شريط متصفّح iPhone فتصير السلّة غير قابلة للنقر.
 */
export function BottomNav() {
  const pathname = usePathname() ?? '/';
  // المسار بعد إعادة كتابة الـproxy هو `/sites/<host>/…` — نقتطع البادئة
  const path = pathname.replace(/^\/sites\/[^/]+/, '') || '/';
  const { cartCount } = useViewer();

  return (
    <nav aria-label="تنقّل سريع"
         className="fixed inset-x-0 bottom-0 z-40 border-t sm:hidden"
         style={{
           background: 'var(--d-surface)',
           borderColor: 'var(--d-border)',
           paddingBottom: 'env(safe-area-inset-bottom)',
         }}>
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          const badge = href === '/cart' && cartCount > 0 ? cartCount : 0;
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined}
                    className="relative flex h-14 flex-col items-center justify-center
                               gap-0.5 text-[11px] font-medium"
                    style={{ color: active ? 'var(--d-accent)' : 'var(--d-text-3)' }}>
                <span className="relative">
                  <Icon size={20} aria-hidden />
                  {badge > 0 && (
                    <span aria-hidden
                          className="absolute -end-2 -top-1.5 grid min-w-4 place-items-center
                                     rounded-full px-1 text-[10px] font-bold leading-4"
                          style={{ background: 'var(--d-accent-surface)',
                                   color: 'var(--d-on-accent)' }}>
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                {label}
                {badge > 0 && <span className="sr-only">{badge} عنصر في السلة</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
