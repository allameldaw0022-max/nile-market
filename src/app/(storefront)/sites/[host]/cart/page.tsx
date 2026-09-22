import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { CartView } from '@/components/storefront/CartView';
import { loadCart, quoteCart } from '@/lib/cart/actions';

export const metadata: Metadata = {
  title: 'السلة',
  robots: { index: false, follow: false },
};

// السلة خاصة بالزائر ⇒ لا تُخزَّن ولا تُصيَّر مسبقًا
export const dynamic = 'force-dynamic';

export default async function CartPage({ params }: PageProps<'/sites/[host]/cart'>) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  const [lines, quote] = await Promise.all([
    loadCart(host),
    quoteCart({ host }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-xl font-extrabold text-navy-900">سلة التسوّق</h1>
      <div className="mt-5">
        <CartView host={host} lines={lines} canCheckout={store.canCheckout}
                  quote={quote.ok ? quote.data : null} />
      </div>
    </div>
  );
}
