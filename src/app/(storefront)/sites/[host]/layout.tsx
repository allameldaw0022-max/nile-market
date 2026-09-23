import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, MessageCircle, Search, ShoppingBag, User } from 'lucide-react';
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
  const [{ data: settings }, { data: branding }, cartLines, actor, guestToken] = await Promise.all([
    supabase.from('store_settings')
      .select('whatsapp_number, theme')
      .eq('store_id', store.storeId)
      .maybeSingle(),
    // الهوية البصرية على `stores` لا على الإعدادات التشغيلية
    supabase.from('stores')
      .select('logo_url')
      .eq('id', store.storeId)
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
    <div className="flex min-h-screen flex-col bg-ink-50">
      <SkipLink />
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2.5">
            {branding?.logo_url && (
              /* ★ كان <img> خامًا: الشعار المخزَّن قد يبلغ ٥ م.ب ويُنزَّل
                 كاملًا لخانة 32px في كل صفحة متجر. `next/image` يخدم
                 النسخة بحجم العرض وصيغة حديثة. */
              <Image src={branding.logo_url} alt="" width={32} height={32}
                     className="size-8 shrink-0 rounded-sm object-cover" />
            )}
            <span className="truncate text-[17px] font-bold text-ink-900">{store.name}</span>
          </Link>

          {/* ★ بحث ظاهر لا أيقونة: البحث أكثر ما يُستعمل في متجر، وإخفاؤه
              خلف نقرة يكلّف كل زائر خطوة في كل مرّة. يبقى أيقونة على
              الشاشات الضيّقة حيث لا تتّسع الترويسة لحقل. */}
          <form role="search" action="/search"
                className="mx-1 hidden h-10 min-w-0 flex-1 items-center gap-2 rounded-md
                           border border-ink-200 bg-white ps-3 focus-within:border-teal-600 sm:flex">
            <Search size={16} className="shrink-0 text-ink-400" aria-hidden />
            <label htmlFor="store-search" className="sr-only">ابحث في منتجات المتجر</label>
            <input id="store-search" name="q" type="search" maxLength={80}
                   placeholder="ابحث عن منتج"
                   className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink-900
                              outline-none placeholder:text-ink-500" />
          </form>

          <div className="ms-auto flex shrink-0 items-center gap-1">
            <Link href="/search" aria-label="البحث"
                  className="grid size-10 place-items-center rounded-md text-ink-700 hover:bg-ink-100 sm:hidden">
              <Search size={20} />
            </Link>
            {actor.kind === 'user' ? (
              <>
                <Link href="/wishlist" aria-label="المفضّلة"
                      className="grid size-10 place-items-center rounded-md
                                 text-ink-700 hover:bg-ink-100">
                  <Heart size={20} aria-hidden />
                </Link>
                <Link href="/account" aria-label="حسابي"
                      className="grid size-10 place-items-center rounded-md
                                 text-ink-700 hover:bg-ink-100">
                  <User size={20} aria-hidden />
                </Link>
              </>
            ) : (
              <Link href="/login" aria-label="تسجيل الدخول"
                    className="grid size-10 place-items-center rounded-md
                               text-ink-700 hover:bg-ink-100">
                <User size={20} aria-hidden />
              </Link>
            )}
            <Link href="/cart"
                  aria-label={cartCount > 0 ? `السلة (${cartCount})` : 'السلة'}
                  className="relative grid size-10 place-items-center rounded-md
                             text-ink-700 hover:bg-ink-100">
              <ShoppingBag size={20} />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 grid min-w-5 place-items-center
                                 rounded-full bg-teal-600 px-1 text-[11px] font-extrabold
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
               className="bg-ink-900 px-4 py-2 text-center text-[13px] font-medium text-white">
            هذا المتجر غير متاح للشراء حاليًا. يمكنك تصفّح المنتجات والتواصل مع المتجر.
          </div>
        )}
      </header>

      {needsMerge && <GuestCartMerger host={host} />}
      <ServiceWorkerRegister />
      <InstallPrompt label={`ثبّت ${store.name} على شاشتك`} />

      <main id="main" className="flex-1">{children}</main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid gap-8 text-[14px] sm:grid-cols-3">
            <div>
              <p className="text-[15px] font-bold text-ink-900">{store.name}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
                تصفّح المنتجات واطلب بسهولة — والتوصيل داخل المدن المتاحة.
              </p>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-ink-900">التسوّق</p>
              <ul className="mt-2.5 space-y-2 text-ink-500">
                <li><Link href="/products" className="hover:text-teal-700">كل المنتجات</Link></li>
                <li><Link href="/orders/track" className="hover:text-teal-700">تتبّع طلبك</Link></li>
                <li><Link href="/wishlist" className="hover:text-teal-700">المفضّلة</Link></li>
                <li><Link href="/account" className="hover:text-teal-700">حسابي</Link></li>
                <li><Link href="/contact" className="hover:text-teal-700">تواصل معنا</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-ink-900">معلومات</p>
              <ul className="mt-2.5 space-y-2 text-ink-500">
                <li><Link href="/pages/shipping" className="hover:text-teal-700">سياسة الشحن</Link></li>
                <li><Link href="/pages/returns" className="hover:text-teal-700">سياسة الاسترجاع</Link></li>
                <li><Link href="/pages/privacy" className="hover:text-teal-700">الخصوصية</Link></li>
              </ul>
            </div>
          </div>
          <p className="mt-9 border-t border-ink-200 pt-5 text-[12px] text-ink-500">
            مدعوم بواسطة{' '}
            <a href="https://nilemarket.online" className="font-medium text-teal-700">سوق النيل</a>
          </p>
        </div>
      </footer>

      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
          target="_blank" rel="noopener noreferrer"
          aria-label="تواصل عبر واتساب"
          className="fixed bottom-5 start-5 z-50 grid size-12 place-items-center
                     rounded-full bg-[#25D366] text-white shadow-popover
                     transition-transform hover:scale-105"
        >
          <MessageCircle size={23} aria-hidden />
        </a>
      )}
    </div>
  );
}

function StoreNotice({ title }: { title: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-50 px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-extrabold text-ink-900">{title}</h1>
        <p className="mt-2 text-sm text-ink-500">
          إن كنت صاحب المتجر، سجّل الدخول إلى لوحة التحكم لمعرفة التفاصيل.
        </p>
      </div>
    </div>
  );
}
