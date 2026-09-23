import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PackageSearch } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { Card } from '@/components/ui/Card';
import { OrderSummary } from '@/components/storefront/OrderSummary';
import { readOrder } from '@/lib/cart/order-read';

export const metadata: Metadata = {
  title: 'تتبّع الطلب',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * تتبّع الطلب برقمه ورقم الهاتف.
 *
 * رقم الطلب متسلسل وقابل للتخمين، فاشتراط الهاتف هو ما يمنع تصفّح
 * طلبات الغير. المطابقة والتحقق كلاهما في `order_details` بالقاعدة.
 */
export default async function TrackOrderPage(
  { params, searchParams }: PageProps<'/sites/[host]/orders/track'>,
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  const sp = await searchParams;
  const number = (typeof sp.number === 'string' ? sp.number : '').trim().slice(0, 40);
  const phone = (typeof sp.phone === 'string' ? sp.phone : '').trim().slice(0, 20);

  const order = number && phone
    ? await readOrder({ storeId: store.storeId, orderNumber: number, phone })
    : null;
  const searched = Boolean(number && phone);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-extrabold text-ink-900">تتبّع الطلب</h1>
      <p className="mt-1 text-sm text-ink-500">
        أدخل رقم الطلب ورقم الهاتف الذي طلبت به.
      </p>

      <Card className="mt-5 p-5">
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold text-ink-700">رقم الطلب</span>
            <input name="number" defaultValue={number} dir="ltr" required maxLength={40}
                   placeholder="NM-00001"
                   className="h-11 w-full rounded-md border border-ink-400
                              bg-white px-3 text-[15px] text-ink-900 focus:border-teal-600" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold text-ink-700">رقم الهاتف</span>
            <input name="phone" defaultValue={phone} dir="ltr" type="tel" required
                   maxLength={20} placeholder="0912345678"
                   className="h-11 w-full rounded-md border border-ink-400
                              bg-white px-3 text-[15px] text-ink-900 focus:border-teal-600" />
          </label>
          <button type="submit"
                  className="h-11 rounded-md bg-teal-600 px-5 font-bold text-white
                             hover:bg-teal-700">
            تتبّع
          </button>
        </form>
      </Card>

      {searched && !order && (
        <div role="alert" className="mt-5 rounded-lg border border-ink-300
                        bg-white px-6 py-10 text-center">
          <PackageSearch className="mx-auto text-ink-400" size={32} strokeWidth={1.5} />
          <p className="mt-3 font-bold text-ink-900">لم نجد طلبًا مطابقًا</p>
          <p className="mt-1 text-sm text-ink-500">
            تأكد من رقم الطلب ورقم الهاتف الذي استخدمته عند الطلب.
          </p>
        </div>
      )}

      {order && <div className="mt-5"><OrderSummary order={order} /></div>}
    </div>
  );
}
