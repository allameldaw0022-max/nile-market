import Link from 'next/link';
import type { StoreChrome } from '@/lib/tenant/chrome';
import type { HomeProducts } from '@/lib/products/home';
import { HeroCarousel } from './HeroCarousel';
import { CategoryTiles } from './CategoryTiles';
import { DigitalGrid } from './DigitalGrid';

/**
 * الصفحة الرئيسية للمتجر الرقمي.
 *
 * ★★ ترتيب الأقسام **ثابت في هذا المكوّن** ولا يملكه التاجر:
 *   ترويسة ← بحث (كلاهما في القشرة) ← لافتة ← بنر ترويجي ←
 *   تصنيفات ← منتجات ← عروض ← واتساب وتذييل (في القشرة).
 * وما يملكه التاجر إظهار القسم أو إخفاؤه — `sections` لا `order`.
 *
 * ★★ ولا بطاقات تسويقية من عندنا: «تنفيذ سريع» و«بياناتك محفوظة»
 * و«طرق دفع واضحة» حُذفت. المتجر يعرض ما يبيعه التاجر، ولا يملأ
 * فراغه بوعودٍ تكتبها المنصّة نيابةً عنه.
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

      {/* ٨: لا منتجات — حالةٌ واحدة نظيفة، بلا بطاقات تسويقية.
          ★ الشرط على المنتجات وحدها: التصنيف بلا منتجات مُرشَّح أصلًا
            في `CategoryTiles`، فوجود تصنيفات لا يعني أنّ للزائر ما
            يشتريه. */}
      {featured.length === 0 && offers.length === 0 && (
        <div className="mt-10 rounded-lg p-8 text-center"
             style={{ background: 'var(--d-surface)',
                      border: '1px solid var(--d-border)' }}>
          <p className="text-[15px] font-bold">لا توجد منتجات</p>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--d-text-2)' }}>
            تابع المتجر — ستُعرض المنتجات هنا فور إضافتها.
          </p>
        </div>
      )}
    </div>
  );
}
