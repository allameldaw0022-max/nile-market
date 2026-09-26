import Link from 'next/link';
import { ShieldCheck, Wallet, Zap } from 'lucide-react';
import type { StoreChrome } from '@/lib/tenant/chrome';
import type { HomeProducts } from '@/lib/products/home';
import { HeroCarousel } from './HeroCarousel';
import { CategoryTiles } from './CategoryTiles';
import { DigitalGrid } from './DigitalGrid';

/**
 * الصفحة الرئيسية للمتجر الرقمي.
 *
 * ★★ ترتيب الأقسام **ثابت في هذا المكوّن** ولا يملكه التاجر: ترويسة
 * ثم بحث (في القشرة) ثم لافتة ثم بنر ترويجي ثم تصنيفات ثم منتجات
 * مميّزة ثم عروض ثم شريط الثقة. وما يملكه التاجر إظهار القسم أو
 * إخفاؤه — وهو `sections` من القشرة، لا `order`.
 *
 * ★ ولا قسم يُرسَم فارغًا: التصنيف بلا منتجات يُرشَّح، والعروض لا
 * تظهر إن لم يكن هناك خصمٌ فعلي، واللافتة لا تظهر بلا بنر. فلا
 * «مساحات فارغة ضخمة» ولا عنوانٌ فوق فراغ.
 *
 * ★ وكل ما تحتاجه هذه الصفحة جاء من نداءين مخزَّنين قائمين
 * (`storeChrome` و`homeProducts`) — صفر استعلام إضافي للقالب.
 */
export function DigitalHome({ host, storeName, chrome, products }: {
  host: string; storeName: string;
  chrome: StoreChrome; products: HomeProducts;
}) {
  const s = chrome.sections;
  const hero = chrome.banners.filter((b) => b.slot === 'hero');
  const promo = chrome.banners.filter((b) => b.slot === 'promo');
  const featured = products.latest;
  const offers = products.onSale;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10">
      {/* ١ + ٢: الترويسة والبحث في القشرة (`DigitalChrome`) */}

      {/* ٣: اللافتة */}
      {s.hero && hero.length > 0 && (
        <HeroCarousel banners={hero} storeName={storeName} />
      )}

      {/* ٤: البنر الترويجي — شريط أفقي لا لافتة ثانية */}
      {s.promo && promo.length > 0 && (
        <section aria-label="عرض ترويجي" className="pt-4">
          {promo.slice(0, 2).map((b) => (
            <div key={b.id}
                 className="flex flex-wrap items-center justify-between gap-3
                            rounded-lg px-4 py-3.5"
                 style={{ background: 'var(--d-accent-weak)',
                          border: '1px solid var(--d-border)' }}>
              <div className="min-w-0">
                {b.title && (
                  <p className="text-[14.5px] font-bold">{b.title}</p>
                )}
                {b.description && (
                  <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--d-text-2)' }}>
                    {b.description}
                  </p>
                )}
              </div>
              {b.ctaLabel && b.ctaHref && (
                <Link href={b.ctaHref}
                      className="h-9 shrink-0 rounded-md px-3.5 text-[13px] font-bold
                                 leading-9"
                      style={{ background: 'var(--d-accent-surface)',
                               color: 'var(--d-on-accent)' }}>
                  {b.ctaLabel}
                </Link>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ٥: التصنيفات */}
      {s.categories && <CategoryTiles categories={chrome.categories} />}

      {/* ٦: المنتجات المميّزة */}
      {s.featured && featured.length > 0 && (
        <section aria-labelledby="d-featured" className="pt-8 sm:pt-10">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="d-featured" className="text-[17px] font-bold sm:text-[19px]">
              الأكثر طلبًا
            </h2>
            <Link href="/products" className="text-[13px] font-semibold"
                  style={{ color: 'var(--d-accent)' }}>
              الكل
            </Link>
          </div>
          <DigitalGrid products={featured} host={host}
                       fromPrices={products.fromPrices} priorityCount={2} />
        </section>
      )}

      {/* ٧: العروض — لا تظهر بلا خصم فعلي */}
      {s.offers && offers.length > 0 && (
        <section aria-labelledby="d-offers" className="pt-8 sm:pt-10">
          <h2 id="d-offers" className="text-[17px] font-bold sm:text-[19px]">
            عروض حالية
          </h2>
          <DigitalGrid products={offers} host={host}
                       fromPrices={products.fromPrices} priorityCount={0} />
        </section>
      )}

      {/* ٨: شريط الثقة — نصّه من إعدادات التاجر الحقيقية لا من قائمة
          ثابتة: متجرٌ لا يقبل التحويل لا يجوز أن تَعِد صفحته به. */}
      <section aria-label="لماذا تشتري من هنا" className="pt-9 sm:pt-11">
        <ul className="grid gap-2.5 sm:grid-cols-3">
          <Trust icon={Zap} title="تنفيذ سريع"
                 body="يُنفَّذ طلبك بعد تأكيد الدفع مباشرة." />
          <Trust icon={ShieldCheck} title="بياناتك محفوظة"
                 body="تُستعمل بيانات الشحن لتنفيذ طلبك وحده." />
          <Trust icon={Wallet} title={payTitle(chrome)} body={payBody(chrome)} />
        </ul>
      </section>

      {featured.length === 0 && chrome.categories.length === 0 && (
        <div className="mt-10 rounded-lg p-8 text-center"
             style={{ background: 'var(--d-surface)',
                      border: '1px solid var(--d-border)' }}>
          <p className="text-[15px] font-bold">لا منتجات متاحة حاليًا</p>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--d-text-2)' }}>
            تابع المتجر — ستُعرض المنتجات هنا فور إضافتها.
          </p>
        </div>
      )}
    </div>
  );
}

function payTitle(chrome: StoreChrome): string {
  const ways = payWays(chrome);
  return ways.length > 0 ? 'طرق دفع واضحة' : 'الدفع';
}

function payBody(chrome: StoreChrome): string {
  const ways = payWays(chrome);
  return ways.length > 0
    ? `${ways.join(' · ')} — تختار عند إتمام الطلب.`
    : 'طرق الدفع المتاحة تظهر عند إتمام الطلب.';
}

function payWays(chrome: StoreChrome): string[] {
  return [
    chrome.codEnabled && 'عند الاستلام',
    chrome.bankTransferEnabled && 'تحويل بنكي',
    chrome.bankakEnabled && 'بنكك',
  ].filter(Boolean) as string[];
}

function Trust({ icon: Icon, title, body }: {
  icon: typeof Zap; title: string; body: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg p-3.5"
        style={{ background: 'var(--d-surface)',
                 border: '1px solid var(--d-border)' }}>
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md"
            style={{ background: 'var(--d-accent-weak)', color: 'var(--d-accent)' }}>
        <Icon size={17} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed"
              style={{ color: 'var(--d-text-2)' }}>
          {body}
        </span>
      </span>
    </li>
  );
}
