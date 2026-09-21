import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { MessageCircle, Search, ShoppingBag } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';

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
  const { data: settings } = await supabase
    .from('store_settings')
    .select('whatsapp_number, theme')
    .eq('store_id', store.storeId)
    .maybeSingle();

  const whatsapp = settings?.whatsapp_number ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-sand-50">
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
            <Link href="/cart" aria-label="السلة"
                  className="grid size-10 place-items-center rounded-[--radius-md] text-navy-700 hover:bg-sand-100">
              <ShoppingBag size={20} />
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

      <main className="flex-1">{children}</main>

      <footer className="border-t border-sand-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-sand-600">
          <p className="font-bold text-navy-900">{store.name}</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <Link href="/pages/shipping" className="hover:text-nile-600">سياسة الشحن</Link>
            <Link href="/pages/returns" className="hover:text-nile-600">سياسة الاسترجاع</Link>
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
