import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { MessageCircle, Search } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { storeChrome } from '@/lib/tenant/chrome';
import { GuestCartMerger } from '@/components/storefront/GuestCartMerger';
import { CartBadge } from '@/components/storefront/CartBadge';
import { AccountNav } from '@/components/storefront/AccountNav';
import { ViewerProvider } from '@/components/storefront/ViewerProvider';
import { DraftOwnerHint } from '@/components/storefront/DraftOwnerHint';
import { StoreMobileNav } from '@/components/storefront/StoreMobileNav';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { SkipLink } from '@/components/ui/SkipLink';
import { waNumber } from '@/lib/phone';

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
 *
 * ★★ ولا يقرأ هذا التخطيط كوكيًّا واحدًا — بعد أن كان يقرأ ثلاثة
 * (سلّة الزائر، وجلسته، وتوكن سلّته) ويسجّل زيارة. وجود أيٍّ منها
 * كان يُخرج **كل** صفحات المتجر من التخزين ويفرض تصييرًا كاملًا
 * لكل طلب: وهو الاختناق الذي قاسه اختبار الضغط (سقف ~٩٥
 * طلبًا/ثانية على أربع أنوية، والانهيار عند ١٠٠٠ مستخدم).
 *
 * الشخصي انتقل إلى `/viewer` (لا يُخزَّن أبدًا)، وتسجيل الزيارة
 * انتقل إلى الـproxy — وهو يرى المسار الحقيقي والكوكي ويعمل قبل
 * طبقة التخزين، فالإحصاء لم ينقص بل صار يشمل الصفحات المخزَّنة.
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

  // ★★ متجر قائم لكنه غير منشور ليس صفحة غير موجودة.
  //
  // كان `draft` و`pending_review` يسقطان في 404 عامّ: صاحب المتجر
  // يفتح رابطه بعد إنشائه فيرى «الصفحة غير موجودة» ولا يعرف أن
  // السبب أنّه لم ينشره بعد — وهو أشيع حالة في المنصة (معظم
  // المتاجر تبقى مسوّدة حتى يُنشرها صاحبها).
  //
  // العنوان يبقى واحدًا للزائر: لا نكشف له أكثر من «غير متاح».
  // والتفصيل يظهر لصاحب المتجر وحده أسفله.
  if (store.status === 'suspended') return <StoreNotice title="المتجر موقوف حاليًا" />;
  if (store.status === 'closed')    return <StoreNotice title="المتجر مغلق مؤقتًا" />;
  if (store.status !== 'active') {
    return <StoreNotice title="هذا المتجر لم يُنشر بعد" draft />;
  }

  // ★ قشرة المتجر (الهوية والإعدادات والتصنيفات) من مصدر واحد
  // مخزَّن: الصفحة تطلب نفس الدالة فلا تتكرّر النداءات، ولا نداء
  // أصلًا بين الطلبات حتى يُبطِل التاجرُ الوسمَ بتعديل.
  const chrome = await storeChrome(store.storeId);
  const branding = { logo_url: chrome.logoUrl, description: chrome.description };
  const navCategories = chrome.categories.slice(0, 8);
  const whatsapp = chrome.whatsapp;

  return (
    <ViewerProvider>
    <div className="flex min-h-screen flex-col bg-white">
      <SkipLink />
      {/* ═══════════ الترويسة ═══════════
          ★ صفّان على الهاتف وصفّان على الحاسوب، لسببين مختلفين:
          على الهاتف الصفّ الأول للتنقّل والسلة والثاني للبحث — لأن
          إخفاء البحث خلف أيقونة يكلّف كل زائر نقرة في كل مرّة.
          وعلى الحاسوب الصفّ الأول للهوية والبحث والحساب والثاني
          لروابط التنقّل والتصنيفات — فالمتجر بلا تنقّل ظاهر يبدو
          صفحةً لا متجرًا. مجموع ارتفاع الصفّين 108px لا يبتلع الشاشة. */}
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-3">
          <StoreMobileNav storeName={store.name}
                          categories={navCategories ?? []} />

          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            {branding?.logo_url && (
              /* ★ كان <img> خامًا: الشعار المخزَّن قد يبلغ ٥ م.ب ويُنزَّل
                 كاملًا لخانة 36px في كل صفحة متجر. */
              <Image src={branding.logo_url} alt="" width={36} height={36}
                     className="size-9 shrink-0 rounded-md object-cover
                                ring-1 ring-ink-200" />
            )}
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-bold leading-tight
                               text-ink-900 sm:text-[17px]">
                {store.name}
              </span>
              {/* ★ الوصف سطر واحد على الحاسوب فقط: هوية المتجر تُقرأ
                  فورًا، ولا تزاحم الترويسة الضيّقة على الهاتف. */}
              {branding?.description && (
                <span className="hidden truncate text-[12px] leading-tight
                                 text-ink-500 lg:block">
                  {branding.description}
                </span>
              )}
            </span>
          </Link>

          <form role="search" action="/search"
                className="mx-2 hidden h-10 min-w-0 max-w-md flex-1 items-center gap-2
                           rounded-md border border-ink-200 bg-ink-50 ps-3
                           transition-colors focus-within:border-teal-600
                           focus-within:bg-white sm:flex">
            <Search size={16} className="shrink-0 text-ink-400" aria-hidden />
            <label htmlFor="store-search-d" className="sr-only">ابحث في منتجات المتجر</label>
            <input id="store-search-d" name="q" type="search" maxLength={80}
                   placeholder="ابحث عن منتج"
                   className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink-900
                              outline-none placeholder:text-ink-500" />
          </form>

          <div className="ms-auto flex shrink-0 items-center gap-0.5">
            <AccountNav />
            <CartBadge />
          </div>
        </div>

        {/* الصفّ الثاني — بحث على الهاتف */}
        <div className="border-t border-ink-200 px-4 py-2.5 sm:hidden">
          <form role="search" action="/search"
                className="flex h-11 items-center gap-2 rounded-md border border-ink-200
                           bg-ink-50 ps-3 focus-within:border-teal-600 focus-within:bg-white">
            <Search size={17} className="shrink-0 text-ink-400" aria-hidden />
            <label htmlFor="store-search-m" className="sr-only">ابحث في منتجات المتجر</label>
            <input id="store-search-m" name="q" type="search" maxLength={80}
                   placeholder="ابحث عن منتج"
                   className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink-900
                              outline-none placeholder:text-ink-500" />
          </form>
        </div>

        {/* الصفّ الثاني — تنقّل على الحاسوب */}
        <nav aria-label="تنقّل المتجر"
             className="hidden border-t border-ink-200 lg:block">
          <ul className="mx-auto flex h-11 max-w-6xl items-stretch gap-1 px-4
                         text-[14px] font-medium">
            <li>
              <Link href="/"
                    className="flex h-full items-center px-3 text-ink-700
                               transition-colors hover:text-teal-700">
                الرئيسية
              </Link>
            </li>
            <li>
              <Link href="/products"
                    className="flex h-full items-center px-3 text-ink-700
                               transition-colors hover:text-teal-700">
                كل المنتجات
              </Link>
            </li>
            {(navCategories ?? []).slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link href={`/categories/${c.slug}`}
                      className="flex h-full items-center px-3 text-ink-700
                                 transition-colors hover:text-teal-700">
                  {c.name}
                </Link>
              </li>
            ))}
            <li className="ms-auto">
              <Link href="/orders/track"
                    className="flex h-full items-center px-3 text-ink-500
                               transition-colors hover:text-teal-700">
                تتبّع طلبك
              </Link>
            </li>
          </ul>
        </nav>

        {/* D14: الاشتراك منتهٍ ⇒ المتجر مرئي والشراء معطّل، بلا حذف شيء */}
        {!store.canCheckout && (
          <div role="status"
               className="bg-ink-900 px-4 py-2 text-center text-[13px] font-medium text-white">
            هذا المتجر غير متاح للشراء حاليًا. يمكنك تصفّح المنتجات والتواصل مع المتجر.
          </div>
        )}
      </header>

      <GuestCartMerger host={host} />
      <ServiceWorkerRegister />
      <InstallPrompt label={`ثبّت ${store.name} على شاشتك`} />

      <main id="main" className="flex-1">{children}</main>

      {/* ═══════════ التذييل ═══════════
          ★ أربعة أعمدة بوظائف مختلفة لا قائمة روابط واحدة: هوية،
          ثم تسوّق، ثم خدمة عملاء، ثم سياسات. الزائر الذي يبحث عن
          «كيف أُرجع؟» لا يجده وسط روابط المنتجات.
          ★ «مدعوم بواسطة سوق النيل» صغير وفي سطر الحقوق: المتجر
          للتاجر، والمنصّة توقيع لا لافتة. */}
      {/* ═══════════ التذييل ═══════════
          ★ أربعة أعمدة بوظائف مختلفة لا قائمة روابط واحدة: هوية،
          ثم تسوّق، ثم خدمة عملاء، ثم سياسات. الزائر الذي يبحث عن
          «كيف أُرجع؟» لا يجده وسط روابط المنتجات.
          ★ «مدعوم بواسطة سوق النيل» صغير وفي سطر الحقوق: المتجر
          للتاجر، والمنصّة توقيع لا لافتة. */}
      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {/* ★ `min-w-0` على عنصر الشبكة لا على النصّ وحده:
                عنصر الشبكة عرضه الأدنى `auto`، فاسم متجر طويل كان
                يوسّع العمود فوق عرض الشاشة ويُنشئ تمريرًا أفقيًّا
                للصفحة كلّها (قيس: ٤٢٨px داخل شاشة ٣٩٠px). و`truncate`
                على النصّ لا تعمل ما لم يُسمح لكل أب فوقه بالانكماش. */}
            <div className="min-w-0 lg:pe-6">
              <div className="flex min-w-0 items-center gap-2.5">
                {branding?.logo_url && (
                  <Image src={branding.logo_url} alt="" width={36} height={36}
                         className="size-9 shrink-0 rounded-md object-cover
                                    ring-1 ring-ink-200" />
                )}
                {/* ★ سطران بدل قصّ بثلاث نقاط: اسم التاجر في تذييل
                    متجره لا يُبتر. */}
                <p className="line-clamp-2 min-w-0 break-words text-[16px]
                              font-bold text-ink-900">
                  {store.name}
                </p>
              </div>
              {branding?.description && (
                <p className="mt-3 break-words text-[13px] leading-relaxed
                              text-ink-500">
                  {branding.description}
                </p>
              )}
              {whatsapp && (
                <a href={`https://wa.me/${waNumber(whatsapp)}`}
                   target="_blank" rel="noopener noreferrer"
                   className="mt-4 inline-flex h-10 items-center gap-2 rounded-md
                              border border-ink-200 px-3.5 text-[13px] font-semibold
                              text-ink-800 transition-colors hover:border-teal-600
                              hover:text-teal-700">
                  <MessageCircle size={16} aria-hidden />
                  تواصل عبر واتساب
                </a>
              )}
            </div>

            <FooterCol title="التسوّق" links={[
              ['/products', 'كل المنتجات'],
              ...(navCategories ?? []).slice(0, 3)
                .map((c) => [`/categories/${c.slug}`, c.name] as [string, string]),
              ['/wishlist', 'المفضّلة'],
            ]} />

            <FooterCol title="خدمة العملاء" links={[
              ['/orders/track', 'تتبّع طلبك'],
              ['/contact', 'تواصل معنا'],
              ['/account', 'حسابي'],
            ]} />

            <FooterCol title="السياسات" links={[
              ['/pages/shipping', 'سياسة الشحن'],
              ['/pages/returns', 'سياسة الاسترجاع'],
              ['/pages/privacy', 'سياسة الخصوصية'],
            ]} />
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-2
                          border-t border-ink-200 pt-5 text-[12px] text-ink-500">
            <p>© {new Date().getFullYear()} {store.name}</p>
            <p>
              مدعوم بواسطة{' '}
              <a href="https://nilemarket.online" target="_blank" rel="noopener noreferrer"
                 className="font-medium text-ink-700 transition-colors hover:text-teal-700">
                سوق النيل
              </a>
            </p>
          </div>
        </div>
      </footer>

      {/* ★ عائم صغير في زاوية البداية: لا يزاحم السلة (زاوية النهاية)
          ولا أي شريط سفلي. و`safe-area-inset-bottom` يمنعه من الاختباء
          خلف شريط المتصفّح على iPhone. */}
      {whatsapp && (
        <a
          href={`https://wa.me/${waNumber(whatsapp)}`}
          target="_blank" rel="noopener noreferrer"
          aria-label="تواصل عبر واتساب"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          className="fixed start-4 z-40 grid size-12 place-items-center rounded-full
                     bg-[#25D366] text-white shadow-popover transition-transform
                     hover:scale-105 focus-visible:scale-105"
        >
          <MessageCircle size={22} aria-hidden />
        </a>
      )}
    </div>
    </ViewerProvider>
  );
}

/**
 * إشعار حالة المتجر للزائر.
 *
 * ★ الرسالة للزائر واحدة مهما كان السبب — لا نكشف له حالة متجر
 * ليس له. والسطر الإضافي يظهر لصاحب المتجر وحده، لأنه هو من يقدر
 * على الفعل، وهو من كان يحتار أمام 404 بلا سبب.
 */
function StoreNotice({ title, draft = false }: {
  title: string; draft?: boolean;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-50 px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-extrabold text-ink-900">{title}</h1>
        {/* ★ الرسالة للزائر واحدة مهما كان السبب — لا نكشف له حالة
            متجر ليس له. والسطر الإضافي يظهر لصاحب المتجر وحده،
            ويُحدَّد على العميل من `/viewer` لا خادميًا: قراءة الجلسة
            هنا كانت تُخرج كل صفحات المتجر من التخزين. */}
        {draft ? (
          <ViewerProvider><DraftOwnerHint /></ViewerProvider>
        ) : (
          <p className="mt-2 text-sm text-ink-500">
            إن كنت صاحب المتجر، سجّل الدخول إلى لوحة التحكم لمعرفة التفاصيل.
          </p>
        )}
      </div>
    </div>
  );
}

/** عمود في تذييل المتجر — عنوان وقائمة روابط. */
function FooterCol({ title, links }: {
  title: string; links: [string, string][];
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-ink-900">{title}</p>
      <ul className="mt-3 space-y-2.5 text-[13px]">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-ink-500 transition-colors hover:text-teal-700">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
