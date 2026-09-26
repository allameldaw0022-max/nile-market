import Image from 'next/image';
import Link from 'next/link';
import { MessageCircle, Search } from 'lucide-react';
import type { StoreChrome } from '@/lib/tenant/chrome';
import { waNumber } from '@/lib/phone';
import { CartBadge } from '../CartBadge';
import { AccountNav } from '../AccountNav';
import { StoreMobileNav } from '../StoreMobileNav';
import { BottomNav } from './BottomNav';
import { ThemeToggle } from './ThemeToggle';

/**
 * قشرة المتجر الرقمي — ترويسة وبحث وتذييل وشريط سفلي.
 *
 * ★★ لا تقرأ كوكيًّا واحدًا، تمامًا كقشرة المتجر العادي: الشخصي كلّه
 * (عدّاد السلّة وحالة الدخول) يأتي من `/viewer` عبر `CartBadge` و
 * `AccountNav` و`BottomNav`. ووجود `cookies()` في أيّ منها كان
 * سيُخرج كل صفحات المتجر من التخزين — وهو الاختناق الذي أُصلح سابقًا.
 *
 * ★ والبحث **ظاهر** لا أيقونة: نموذج `GET` حقيقي إلى `/search` يعمل
 * بلا جافاسكربت ويستفيد من قشرة البحث المخزَّنة و`/api/products`.
 *
 * ★ والشريط السفلي على الهاتف وحده، والزرّ العائم للواتساب يُرفَع
 * فوقه بمقدار ارتفاعه + المنطقة الآمنة فلا يغطّي شيئًا.
 */
export function DigitalChrome({
  host, storeName, chrome, canCheckout, children,
}: {
  host: string; storeName: string; chrome: StoreChrome;
  canCheckout: boolean; children: React.ReactNode;
}) {
  void host;
  const cats = chrome.categories.filter((c) => c.productCount > 0);
  const wa = chrome.whatsapp;

  return (
    <div data-nm-digital
         className="flex min-h-screen flex-col"
         style={{ background: 'var(--d-bg)', color: 'var(--d-text)' }}>
      {/* ═══════ ١) الترويسة ═══════ */}
      <header className="sticky top-0 z-40 border-b"
              style={{ background: 'var(--d-surface)',
                       borderColor: 'var(--d-border)' }}>
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:h-16 sm:gap-3">
          <StoreMobileNav storeName={storeName}
                          categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />

          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            {chrome.logoUrl && (
              <Image src={chrome.logoUrl} alt="" width={34} height={34}
                     className="size-[34px] shrink-0 rounded-md object-cover" />
            )}
            <span className="min-w-0 truncate text-[15.5px] font-bold sm:text-[17px]">
              {storeName}
            </span>
          </Link>

          <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
            <span className="hidden sm:block"><ThemeToggle /></span>
            <AccountNav />
            <CartBadge />
          </div>
        </div>

        {/* ═══════ ٢) البحث — ظاهر دائمًا ═══════ */}
        <div className="border-t px-4 py-2.5" style={{ borderColor: 'var(--d-border)' }}>
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            <form role="search" action="/search" className="relative min-w-0 flex-1">
              <Search size={16} aria-hidden
                      className="pointer-events-none absolute start-3 top-1/2
                                 -translate-y-1/2"
                      style={{ color: 'var(--d-text-3)' }} />
              <label htmlFor="d-search" className="sr-only">ابحث في منتجات المتجر</label>
              <input id="d-search" name="q" type="search" maxLength={80}
                     placeholder="ابحث عن لعبة أو بطاقة أو خدمة"
                     className="h-11 w-full rounded-md ps-10 pe-3 text-[14.5px]
                                outline-none"
                     style={{ background: 'var(--d-surface-2)',
                              border: '1px solid var(--d-border)',
                              color: 'var(--d-text)' }} />
            </form>
            <span className="sm:hidden"><ThemeToggle /></span>
          </div>
        </div>

        {/* شريط تصنيفات على الحاسوب */}
        {cats.length > 0 && (
          <nav aria-label="تنقّل المتجر" className="hidden border-t lg:block"
               style={{ borderColor: 'var(--d-border)' }}>
            <ul className="mx-auto flex h-10 max-w-6xl items-stretch gap-1 px-4
                           text-[13.5px] font-medium">
              <li>
                <Link href="/products" className="flex h-full items-center px-3"
                      style={{ color: 'var(--d-text-2)' }}>
                  كل المنتجات
                </Link>
              </li>
              {cats.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <Link href={`/categories/${c.slug}`}
                        className="flex h-full items-center px-3"
                        style={{ color: 'var(--d-text-2)' }}>
                    {c.name}
                  </Link>
                </li>
              ))}
              <li className="ms-auto">
                <Link href="/orders/track" className="flex h-full items-center px-3"
                      style={{ color: 'var(--d-text-3)' }}>
                  تتبّع طلبك
                </Link>
              </li>
            </ul>
          </nav>
        )}

        {/* ★★ المتجر غير مؤهَّل لاستقبال الطلبات: رسالة **محيَّدة**.
            لا اسم باقة، ولا حالة اشتراك، ولا معلومة دفع — الزبون لا
            شأن له بحساب التاجر. والتوجيه إلى الباقة يظهر لصاحب المتجر
            وحده في لوحته. */}
        {!canCheckout && (
          <div role="status" className="px-4 py-2 text-center text-[12.5px] font-medium"
               style={{ background: 'var(--d-invert-bg)',
                        color: 'var(--d-invert-text)' }}>
            هذا المتجر غير متاح لاستقبال الطلبات حاليًا. يمكنك تصفّح المنتجات
            والتواصل مع المتجر.
          </div>
        )}
      </header>

      <main id="main" className="flex-1">{children}</main>

      {/* ═══════ التذييل ═══════ */}
      <footer className="border-t" style={{ borderColor: 'var(--d-border)',
                                            background: 'var(--d-surface)' }}>
        <div className="mx-auto max-w-6xl px-4 py-9">
          <div className="grid gap-7 sm:grid-cols-3">
            <div className="min-w-0">
              <p className="text-[15px] font-bold">{storeName}</p>
              {chrome.description && (
                <p className="mt-2 break-words text-[12.5px] leading-relaxed"
                   style={{ color: 'var(--d-text-2)' }}>
                  {chrome.description}
                </p>
              )}
              {wa && (
                <a href={`https://wa.me/${waNumber(wa)}`} target="_blank"
                   rel="noopener noreferrer"
                   className="mt-3.5 inline-flex h-10 items-center gap-2 rounded-md
                              px-3.5 text-[13px] font-semibold"
                   style={{ border: '1px solid var(--d-border-strong)',
                            color: 'var(--d-text)' }}>
                  <MessageCircle size={15} aria-hidden />
                  تواصل عبر واتساب
                </a>
              )}
            </div>
            <FooterCol title="التسوّق" links={[
              ['/products', 'كل المنتجات'],
              ...cats.slice(0, 3).map((c) =>
                [`/categories/${c.slug}`, c.name] as [string, string]),
              ['/wishlist', 'المفضّلة'],
            ]} />
            <FooterCol title="خدمة العملاء" links={[
              ['/orders/track', 'تتبّع طلبك'],
              ['/contact', 'تواصل معنا'],
              ['/account', 'حسابي'],
              ['/pages/privacy', 'سياسة الخصوصية'],
            ]} />
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-2
                          border-t pt-4 text-[11.5px]"
               style={{ borderColor: 'var(--d-border)', color: 'var(--d-text-3)' }}>
            <p>© {new Date().getFullYear()} {storeName}</p>
            <p>
              مدعوم بواسطة{' '}
              <a href="https://nilemarket.online" target="_blank"
                 rel="noopener noreferrer" className="font-medium"
                 style={{ color: 'var(--d-text-2)' }}>
                سوق النيل
              </a>
            </p>
          </div>
        </div>
        {/* مساحة الشريط السفلي على الهاتف حتى لا يغطّي آخر سطر */}
        <div aria-hidden className="h-14 sm:hidden"
             style={{ marginBottom: 'env(safe-area-inset-bottom)' }} />
      </footer>

      {/* ★ الزرّ العائم فوق الشريط السفلي لا تحته: ارتفاع الشريط ٥٦px
          + المنطقة الآمنة + فراغ. وعلى الحاسوب لا شريط، فيعود لأسفل. */}
      {wa && (
        <a href={`https://wa.me/${waNumber(wa)}`} target="_blank"
           rel="noopener noreferrer" aria-label="تواصل عبر واتساب"
           className="d-wa fixed start-4 z-30 grid size-12 place-items-center
                      rounded-full text-white shadow-popover transition-transform
                      hover:scale-105 focus-visible:scale-105"
           style={{ background: '#25D366' }}>
          <MessageCircle size={22} aria-hidden />
        </a>
      )}

      <BottomNav />
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-[12.5px] font-semibold">{title}</p>
      <ul className="mt-2.5 space-y-2 text-[12.5px]">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} style={{ color: 'var(--d-text-2)' }}>{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
