import Link from 'next/link';
import { Store } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { Button } from '@/components/ui/Button';
import { SkipLink } from '@/components/ui/SkipLink';

export default async function PlatformLayout({ children }: LayoutProps<'/'>) {
  const actor = await getActor();
  const signedIn = actor.kind === 'user';

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-ink-900">
            <span className="grid size-9 place-items-center rounded-[--radius-md] bg-teal-600 text-white">
              <Store size={18} />
            </span>
            سوق النيل
          </Link>

          <div className="hidden flex-1 items-center gap-6 text-sm font-medium text-ink-700 md:flex">
            <Link href="/pricing" className="hover:text-teal-700">الباقات</Link>
            <Link href="/support" className="hover:text-teal-700">الدعم</Link>
          </div>

          <div className="ms-auto flex items-center gap-2">
            {signedIn ? (
              <>
                <Link href="/account/security"
                      className="hidden text-sm font-bold text-ink-700 hover:text-teal-700 sm:block">
                  الأمان
                </Link>
                <Link href={actor.stores.length ? '/dashboard' : '/onboarding'}>
                  <Button size="sm">
                    {actor.stores.length ? 'لوحة التحكم' : 'أنشئ متجرك'}
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm">تسجيل الدخول</Button>
                </Link>
                <Link href="/signup">
                  <Button size="sm">أنشئ متجرك</Button>
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main id="main" className="flex-1">{children}</main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid gap-8 text-sm sm:grid-cols-3">
            <div>
              <p className="font-extrabold text-ink-900">سوق النيل</p>
              <p className="mt-2 text-ink-500">
                منصة سودانية لإنشاء وإدارة متجرك الإلكتروني.
              </p>
            </div>
            <div>
              <p className="font-bold text-ink-900">المنصة</p>
              <ul className="mt-2 space-y-1.5 text-ink-500">
                <li><Link href="/pricing" className="hover:text-teal-700">الباقات</Link></li>
                <li><Link href="/support" className="hover:text-teal-700">الدعم والمساعدة</Link></li>
                <li><Link href="/support/new" className="hover:text-teal-700">تواصل معنا</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-ink-900">قانوني</p>
              <ul className="mt-2 space-y-1.5 text-ink-500">
                <li><Link href="/legal/terms" className="hover:text-teal-700">الشروط والأحكام</Link></li>
                <li><Link href="/legal/privacy" className="hover:text-teal-700">سياسة الخصوصية</Link></li>
                <li><Link href="/legal/subscription" className="hover:text-teal-700">سياسة الاشتراك</Link></li>
                <li><Link href="/legal/cancellation" className="hover:text-teal-700">سياسة الإلغاء</Link></li>
              </ul>
            </div>
          </div>
          <p className="mt-8 border-t border-ink-200 pt-6 text-xs text-ink-500">
            © {new Date().getFullYear()} سوق النيل — جميع الحقوق محفوظة.
          </p>
        </div>
      </footer>
    </div>
  );
}
