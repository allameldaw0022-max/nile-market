import { randomUUID } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';
import { getActor } from '@/lib/auth/actor';
import { CheckoutForm, type PaymentOption, type Zone } from '@/components/storefront/CheckoutForm';
import { loadCart, quoteCart } from '@/lib/cart/actions';
import { checkoutPaymentInfo } from '@/lib/cart/receipt';

export const metadata: Metadata = {
  title: 'إتمام الطلب',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({ params }: PageProps<'/sites/[host]/checkout'>) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  const lines = await loadCart(host);
  if (lines.length === 0) redirect('/cart');

  const supabase = await createClient();
  const [{ data: zoneRows }, { data: settings }, quote, actor, bank] = await Promise.all([
    supabase.from('delivery_zones')
      .select('id, name, fee, min_order_free')
      .eq('store_id', store.storeId).eq('is_active', true).is('deleted_at', null)
      .order('sort_order').order('name'),
    supabase.from('store_settings')
      .select('cod_enabled, bank_transfer_enabled, bankak_enabled')
      .eq('store_id', store.storeId).maybeSingle(),
    quoteCart({ host }),
    getActor(),
    // بيانات الحساب تُفتح لمن له سلة في هذا المتجر — لا لكل زائر
    checkoutPaymentInfo(host),
  ]);

  const zones: Zone[] = (zoneRows ?? []).map((z) => ({
    id: z.id, name: z.name, fee: Number(z.fee),
    minOrderFree: z.min_order_free === null ? null : Number(z.min_order_free),
  }));

  // طرق الدفع من إعدادات المتجر — والقاعدة ترفض أي طريقة غير مفعّلة
  const payments: PaymentOption[] = [];
  if (settings?.cod_enabled) payments.push({
    value: 'cash_on_delivery', label: 'الدفع عند الاستلام',
    hint: 'تدفع نقدًا لمندوب التوصيل عند وصول الطلب.',
  });
  if (settings?.bank_transfer_enabled) payments.push({
    value: 'bank_transfer', label: 'تحويل بنكي',
    hint: 'تظهر لك بيانات الحساب هنا، تحوّل، ثم ترفق الإيصال قبل تأكيد الطلب.',
  });
  if (settings?.bankak_enabled) payments.push({
    value: 'bankak', label: 'بنكك',
    hint: 'تحويل عبر بنكك، ثم ترفق صورة الإشعار قبل تأكيد الطلب.',
  });

  const profile = actor.kind === 'user' ? actor : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-extrabold text-ink-900">إتمام الطلب</h1>

      {!store.canCheckout && (
        <p role="alert" className="mt-4 rounded-md border border-ink-300
                        bg-ink-100 p-4 text-sm font-bold text-ink-600">
          هذا المتجر غير متاح للشراء حاليًا. يمكنك التواصل معه عبر واتساب.
        </p>
      )}

      <div className="mt-5">
        <CheckoutForm
          host={host} lines={lines} zones={zones} payments={payments}
          bankAccounts={bank.accounts} bankakNumber={bank.bankak}
          // مفتاح التكرار يُولَّد مع الصفحة: ضغطتان على «تأكيد» أو إعادة
          // إرسال النموذج تعيدان الطلب نفسه لا طلبًا ثانيًا (§13).
          idempotencyKey={randomUUID()}
          initialQuote={quote.ok ? quote.data : {
            subtotal: 0, deliveryFee: 0, discountTotal: 0, total: 0,
            couponValid: false, couponMessage: null,
            canCheckout: store.canCheckout, outOfStock: false, itemCount: 0,
          }}
          defaults={{
            name: profile?.fullName ?? '',
            phone: '',
            email: profile?.email ?? '',
          }}
        />
      </div>
    </div>
  );
}
