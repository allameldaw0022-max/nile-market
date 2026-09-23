import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { getActor } from '@/lib/auth/actor';
import { StoreResetForm } from '@/components/storefront/StoreResetForm';
import { Card } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'تعيين كلمة مرور جديدة',
  robots: { index: false, follow: false },
};

/**
 * تعيين كلمة مرور جديدة على نطاق المتجر.
 *
 * ★ يُفتح بعد أن يكون `/auth/confirm` قد بدّل رابط الاستعادة بجلسة
 * مؤقّتة على **هذا المضيف**. فمن يصل بلا جلسة رابطه منتهٍ أو مزوَّر،
 * ولا يُعرض له نموذج يوهمه بأنه يغيّر شيئًا.
 */
export default async function StoreResetPage(
  { params }: PageProps<'/sites/[host]/reset-password'>,
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  const actor = await getActor();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      {actor.kind !== 'user' ? (
        <Card className="p-6">
          <h1 className="text-[20px] font-bold text-ink-900">الرابط غير صالح</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-500">
            انتهت صلاحية رابط الاستعادة أو سبق استعماله. اطلب رابطًا جديدًا
            من صفحة تسجيل الدخول.
          </p>
        </Card>
      ) : (
        <StoreResetForm />
      )}
    </div>
  );
}
