import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CheckCircle2, MessageCircle, Search } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OrderSummary } from '@/components/storefront/OrderSummary';
import { readLastOrder } from '@/lib/cart/token';
import { readOrder } from '@/lib/cart/order-read';

export const metadata: Metadata = {
  title: 'تم استلام طلبك',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OrderConfirmationPage(
  { params }: PageProps<'/sites/[host]/order'>,
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  // التوكن من كوكي HttpOnly كتبه فعل إتمام الطلب ⇒ لا رقم في الرابط
  const last = await readLastOrder(host);
  if (!last) {
    return (
      <div className="mx-auto max-w-lg px-4 py-14 text-center">
        <Search className="mx-auto text-sand-400" size={36} strokeWidth={1.5} />
        <h1 className="mt-3 text-lg font-extrabold text-navy-900">لا يوجد طلب حديث</h1>
        <p className="mt-1 text-sm text-sand-600">
          إن كنت طلبت من قبل، تتبّع طلبك برقمه ورقم هاتفك.
        </p>
        <Link href="/orders/track" className="mt-5 inline-block">
          <Button>تتبّع طلب</Button>
        </Link>
      </div>
    );
  }

  const order = await readOrder({
    storeId: store.storeId,
    orderNumber: last.orderNumber,
    guestToken: last.guestToken,
  });
  if (!order) notFound();

  const supabase = await createClient();
  const [{ data: settings }, { data: payment }] = await Promise.all([
    supabase.from('store_settings').select('whatsapp_number')
      .eq('store_id', store.storeId).maybeSingle(),
    // بيانات الحساب البنكي تُقرأ من جدولها المنفصل، ولا تظهر إلا
    // لمن طلب فعلًا بتحويل بنكي
    order.paymentMethod === 'bank_transfer' || order.paymentMethod === 'bankak'
      ? supabase.from('store_payment_settings').select('bank_accounts')
          .eq('store_id', store.storeId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const accounts = (payment?.bank_accounts ?? []) as { bank?: string; account?: string }[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="text-center">
        <CheckCircle2 className="mx-auto text-[--color-success]" size={44} />
        <h1 className="mt-3 text-xl font-extrabold text-navy-900">تم استلام طلبك</h1>
        <p className="mt-1 text-sm text-sand-600">
          سيتواصل معك المتجر لتأكيد الطلب. احتفظ برقم الطلب للمتابعة.
        </p>
      </div>

      <div className="mt-6">
        <OrderSummary order={order} />
      </div>

      {accounts.length > 0 && (
        <Card className="mt-5 p-5">
          <h2 className="font-bold text-navy-900">بيانات التحويل</h2>
          <p className="mt-1 text-sm text-sand-600">
            حوّل المبلغ ثم أرسل صورة الإشعار للمتجر عبر واتساب.
          </p>
          <ul className="mt-3 space-y-2">
            {accounts.map((a, i) => (
              <li key={`${a.account}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-[--radius-md]
                             border border-sand-200 p-3 text-sm">
                <span className="font-bold text-navy-900">{a.bank ?? 'بنك'}</span>
                <span className="tabular text-navy-700" dir="ltr">{a.account}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/products"><Button variant="outline">مواصلة التسوّق</Button></Link>
        {settings?.whatsapp_number && (
          <a href={`https://wa.me/${settings.whatsapp_number.replace(/\D/g, '')}`}
             target="_blank" rel="noopener noreferrer">
            <Button icon={<MessageCircle size={16} />}>تواصل مع المتجر</Button>
          </a>
        )}
      </div>
    </div>
  );
}
