import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageCircle, Search, ShoppingBag } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';
import { getActor } from '@/lib/auth/actor';
import { loadCart } from '@/lib/cart/actions';
import { readCartToken } from '@/lib/cart/token';
import { GuestCartMerger } from '@/components/storefront/GuestCartMerger';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { trackVisit } from '@/lib/analytics/track';
import { SkipLink } from '@/components/ui/SkipLink';

/**
 * بيانات رأس الصفحة المشتركة لكل صفحات المتجر.
 *
 * ★ البيان والأيقونات هنا لا في كل صفحة: تكرارها كان سيجعل صفحة
 * واحدة منسيّة تكسر التثبيت.
 */
export async function generateMetadata(
  { params }: LayoutProps<'/sites/[host]'>,
): Promise<Metadata> {
  const { host } = await params;
  const store = await resolveStoreByHost(host);

  return {
    manifest: '/manifest.webmanifest',
    applicationName: store?.name,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: store?.name,
    },
    icons: {
      icon: '/icons/icon-192.png',
      apple: '/icons/apple-touch-icon.png',
    },
    formatDetection: { telephone: false },
  };
}

/**
 * تخطيط المتجر المستأجر.
 *
 * ★ storeId يُشتق من الـhost في المسار حصريًا — لا يُقبل من أي مصدر
 * آخر. هذا هو جدار منع IDOR الأول.
 */
export default async function StorefrontLayout({
  children, params,
}: LayoutProps<'/sites/[host]'>) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);

  if (!store) notFound();

  // دومين غير أساسي ⇒ 301 إلى الأساسي مع الحفاظ على المسار (§10.5)
  if (store.isRedirect && store.primaryHost && store.primaryHost !== host) {
    permanentRedirect(`https://${store.primaryHost}`);
  }

  if (store.status === 'suspended') return <StoreNotice title="المتجر موقوف حاليًا" />;
  if (store.status === 'closed')    return <StoreNotice title="المتجر مغلق مؤقتًا" />;
  if (store.status !== 'active')    notFound();

  const supabase = await createClient();
  const [{ data: settings }, cartLines, actor, guestToken] = await Promise.all([
    supabase.from('store_settings')
      .select('whatsapp_number, theme')
      .eq('store_id', store.storeId)
      .maybeSingle(),
    loadCart(host),
    getActor(),
    readCartToken(host),
  ]);

  // إحصاء الزيارة بعد التأكّد من أن المتجر نشط ومرئي — لا تُحسب
  // زيارة لمتجر موقوف. والقاعدة تتجاهل التكرار خلال دقيقة.
  await trackVisit(store.storeId);

  const whatsapp = settings?.whatsapp_number ?? null;
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  // الدمج يُطلب فقط حين يوجد الطرفان: حساب مسجَّل وتوكن سلة زائر
  const needsMerge = actor.kind === 'user' && Boolean(guestToken);

  return (
    <div className="flex min-h-screen flex-col bg-sand-50">
      <SkipLink />
      <header className="sticky top-0 z-40 border-b border-sand-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="truncate text-lg font-extrabold text-navy-900">
            {store.name}
          </Link>
          <div className="ms-auto flex items-center gap-1">
            <Link href="/search" aria-label="البحث"
                  className="grid size-10 place-items-center rounded-[--radius-md] text-navy-700 hover:bg-sand-100">
              <Search size={20} />
            </Link>
            <Link href="/cart"
                  aria-label={cartCount > 0 ? `السلة (${cartCount})` : 'السلة'}
                  className="relative grid size-10 place-items-center rounded-[--radius-md]
                             text-navy-700 hover:bg-sand-100">
              <ShoppingBag size={20} />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 grid min-w-5 place-items-center
                                 rounded-full bg-nile-500 px-1 text-[11px] font-extrabold
                                 text-white tabular">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* D14: الاشتراك منتهٍ ⇒ المتجر مرئي والشراء معطّل، بلا حذف شيء */}
        {!store.canCheckout && (
          <div role="status"
               className="bg-navy-900 px-4 py-2 text-center text-[13px] font-medium text-white">
            هذا المتجر غير متاح للشراء حاليًا. يمكنك تصفّح المنتجات والتواصل مع المتجر.
          </div>
        )}
      </header>

      {needsMerge && <GuestCartMerger host={host} />}
      <ServiceWorkerRegister />
      <InstallPrompt label={`ثبّت ${store.name} على شاشتك`} />

      <main id="main" className="flex-1">{children}</main>

      <footer className="border-t border-sand-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-sand-600">
          <p className="font-bold text-navy-900">{store.name}</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <Link href="/products" className="hover:text-nile-600">كل المنتجات</Link>
            <Link href="/orders/track" className="hover:text-nile-600">تتبّع طلبك</Link>
            <Link href="/pages/shipping" className="hover:text-nile-600">سياسة الشحن</Link>
            <Link href="/pages/returns" className="hover:text-nile-600">سياسة الاسترجاع</Link>
            <Link href="/pages/privacy" className="hover:text-nile-600">الخصوصية</Link>
            <Link href="/contact" className="hover:text-nile-600">تواصل معنا</Link>
          </div>
          <p className="mt-6 border-t border-sand-200 pt-4 text-xs">
            مدعوم بواسطة{' '}
            <a href="https://nilemarket.online" className="font-bold text-nile-600">نايل ماركت</a>
          </p>
        </div>
      </footer>

      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
          target="_blank" rel="noopener noreferrer"
          aria-label="تواصل عبر واتساب"
          className="fixed bottom-5 start-5 z-50 grid size-14 place-items-center
                     rounded-full bg-[#25D366] text-white shadow-[--shadow-overlay]"
        >
          <MessageCircle size={26} />
        </a>
      )}
    </div>
  );
}

function StoreNotice({ title }: { title: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-sand-50 px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-extrabold text-navy-900">{title}</h1>
        <p className="mt-2 text-sm text-sand-600">
          إن كنت صاحب المتجر، سجّل الدخول إلى لوحة التحكم لمعرفة التفاصيل.
        </p>
      </div>
    </div>
  );
}
