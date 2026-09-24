import Link from 'next/link';
import { getActor } from '@/lib/auth/actor';
import { buttonClass } from '@/components/ui/Button';
import { SkipLink } from '@/components/ui/SkipLink';
import { Wordmark } from '@/components/marketing/Wordmark';
import { MobileNav } from '@/components/marketing/MobileNav';

/** روابط القسم العام — قائمة واحدة تُستعمل في الشريطين: الواسع والضيّق. */
const NAV = [
  { href: '/',         label: 'الرئيسية' },
  { href: '/#how',     label: 'كيف يعمل' },
  { href: '/pricing',  label: 'الباقات' },
  { href: '/#faq',     label: 'الأسئلة الشائعة' },
  { href: '/partners', label: 'كن شريكاً' },
  { href: '/support',  label: 'الدعم' },
];

export default async function PlatformLayout({ children }: LayoutProps<'/'>) {
  const actor = await getActor();
  const signedIn = actor.kind === 'user';
  const hasStore = actor.kind === 'user' && actor.stores.length > 0;
  const appHref = hasStore ? '/dashboard' : '/onboarding';
  const appLabel = hasStore ? 'لوحة التحكم' : 'أنشئ متجرك';

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />

      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/92 backdrop-blur-sm">
        <nav aria-label="التنقّل الرئيسي"
             className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Wordmark />

          <ul className="hidden flex-1 items-center gap-6 text-[14px] font-medium text-ink-600 lg:flex">
            {NAV.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="transition-colors hover:text-ink-900">{l.label}</Link>
              </li>
            ))}
          </ul>

          <div className="ms-auto flex items-center gap-2">
            {signedIn ? (
              <Link href={appHref} className={buttonClass('primary', 'sm')}>{appLabel}</Link>
            ) : (
              <>
                <Link href="/login"
                      className="hidden px-2 text-[14px] font-medium text-ink-600
                                 transition-colors hover:text-ink-900 sm:block">
                  تسجيل الدخول
                </Link>
                <Link href="/signup" className={buttonClass('primary', 'sm')}>أنشئ متجرك</Link>
              </>
            )}
            <MobileNav items={NAV} signedIn={signedIn} appHref={appHref} appLabel={appLabel} />
          </div>
        </nav>
      </header>

      <main id="main" className="flex-1">{children}</main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="grid gap-9 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <Wordmark />
              <p className="mt-3 max-w-xs leading-relaxed text-ink-500">
                أنشئ متجرك الإلكتروني وأدِر منتجاتك وطلباتك ومخزونك من لوحة واحدة.
              </p>
            </div>

            <FooterCol title="المنتج" links={[
              ['/#how', 'كيف يعمل'],
              ['/pricing', 'الباقات'],
              ['/partners', 'كن شريكاً'],
              ['/#faq', 'الأسئلة الشائعة'],
            ]} />
            <FooterCol title="الدعم" links={[
              ['/support', 'مركز المساعدة'],
              ['/support/new', 'تواصل معنا'],
              ['/login', 'تسجيل الدخول'],
            ]} />
            <FooterCol title="قانوني" links={[
              ['/legal/terms', 'الشروط والأحكام'],
              ['/legal/privacy', 'سياسة الخصوصية'],
              ['/legal/subscription', 'سياسة الاشتراك'],
              ['/legal/cancellation', 'سياسة الإلغاء'],
            ]} />
          </div>

          <p className="mt-10 border-t border-ink-200 pt-6 text-[13px] text-ink-500">
            © {new Date().getFullYear()} سوق النيل — جميع الحقوق محفوظة.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-ink-900">{title}</p>
      <ul className="mt-3 space-y-2 text-ink-500">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="transition-colors hover:text-teal-700">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
