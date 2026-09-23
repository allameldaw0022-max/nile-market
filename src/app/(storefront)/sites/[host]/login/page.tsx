import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { getActor } from '@/lib/auth/actor';
import { StoreAuthForm } from '@/components/storefront/StoreAuthForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: PageProps<'/sites/[host]/login'>,
): Promise<Metadata> {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  return {
    title: 'تسجيل الدخول',
    description: store ? `ادخل إلى حسابك في ${store.name}` : undefined,
    robots: { index: false, follow: false },
  };
}

/**
 * دخول عميل المتجر.
 *
 * ★ الصفحة تعيش على مضيف المتجر نفسه، فالجلسة تُكتب عليه وحده.
 * هذا ما يجعل العزل بين المتاجر سلوكًا افتراضيًا لا ميزة مضافة،
 * ويجعل الحلّ يعمل على النطاق المخصّص بلا استثناء.
 *
 * ★ هذه **ليست** بوابة لوحة التاجر: `/dashboard` و`/admin` يحجبها
 * الـproxy على نطاق المتجر أصلًا (404). من يدخل من هنا يدخل زبونًا.
 */
export default async function StoreLoginPage(
  { params, searchParams }: PageProps<'/sites/[host]/login'>,
) {
  const { host } = await params;
  const sp = await searchParams;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  // من دخل فعلًا لا يرى صفحة الدخول
  const actor = await getActor();
  if (actor.kind === 'user') redirect('/');

  const next = typeof sp.next === 'string' ? sp.next : '/';
  const mode = sp.mode === 'register' ? 'register'
    : sp.mode === 'reset' ? 'reset' : 'login';
  const notice = typeof sp.notice === 'string' ? sp.notice : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <StoreAuthForm host={host} storeName={store.name} next={next}
                     mode={mode} notice={notice} />
    </div>
  );
}
