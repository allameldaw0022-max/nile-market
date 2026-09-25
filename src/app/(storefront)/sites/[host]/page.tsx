import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { storeChrome } from '@/lib/tenant/chrome';
import { createClient } from '@/lib/supabase/server';
import { ProductShowcase } from '@/components/storefront/ProductShowcase';
import { StoreHero } from '@/components/storefront/StoreHero';
import { StoreContact } from '@/components/storefront/StoreContact';

export const revalidate = 60;

// ★ النصّ حرفيًا في كل استعلام: تمريره عبر ثابت يُفقد Supabase
// استدلال الأنواع فيعود `GenericStringError` بدل صفوف المنتجات.
export async function generateMetadata(
  { params }: PageProps<'/sites/[host]'>,
): Promise<Metadata> {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) return { title: 'المتجر غير موجود' };

  // ★ canonical مبني دائمًا على الدومين الأساسي (§10.7)
  const canonical = `https://${store.primaryHost}`;
  return {
    title: store.name,
    alternates: { canonical },
    openGraph: {
      title: store.name, url: canonical, siteName: store.name,
      type: 'website', locale: 'ar_SD',
    },
  };
}

/**
 * الصفحة الرئيسية للمتجر.
 *
 * ★ متجر لا صفحة داخل لوحة تحكّم: البنية بنية متجر حقيقي — لافتة
 * بهوية التاجر، ثم تصنيفات، ثم عروض، ثم أحدث المنتجات، ثم شريط
 * خدمات. لا تدرّج لوني ولا بطاقات مكرّرة.
 *
 * ★ اللافتة تعرض صورة التاجر إن رفعها، وإلا شريطًا داكنًا باسمه
 * ووصفه. لا نخترع صورة ولا نترك فراغًا.
 */
export default async function StoreHome({ params }: PageProps<'/sites/[host]'>) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  const supabase = await createClient();

  // ★ التصنيفات والهوية وطرق الدفع من القشرة المخزَّنة نفسها التي
  // يستعملها التخطيط ⇒ لا نداء ثانٍ لها في هذه الصفحة.
  const [chrome, { data: latest }, { data: deals }] =
    await Promise.all([
      storeChrome(store.storeId),
      supabase.from('products')
        .select(
          'id, name, slug, price, compare_at_price, rating_avg, rating_count, has_variants, track_inventory, inventory(quantity, reserved), product_images(media_file_id, is_primary, media_files(path, bucket, blur_data_url))')
        .eq('store_id', store.storeId).eq('status', 'active').is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(8),
      // العروض: ما له سعر قبل الخصم أعلى من سعره الحالي
      supabase.from('products')
        .select(
          'id, name, slug, price, compare_at_price, rating_avg, rating_count, has_variants, track_inventory, inventory(quantity, reserved), product_images(media_file_id, is_primary, media_files(path, bucket, blur_data_url))')
        .eq('store_id', store.storeId).eq('status', 'active').is('deleted_at', null)
        .not('compare_at_price', 'is', null)
        .order('created_at', { ascending: false }).limit(4),
    ]);

  const categories = chrome.categories;
  const onSale = (deals ?? []).filter(
    (p) => p.compare_at_price != null && Number(p.compare_at_price) > Number(p.price));
  const banner = chrome.bannerUrl;
  const logo = chrome.logoUrl;

  // ★ نصّ الدفع من إعدادات التاجر الحقيقية لا من قائمة ثابتة: متجر
  // لا يقبل الدفع عند الاستلام لا يجوز أن تَعِد صفحته به.
  const pay = [
    chrome.codEnabled && 'عند الاستلام',
    chrome.bankTransferEnabled && 'تحويل بنكي',
    chrome.bankakEnabled && 'بنكك',
  ].filter(Boolean) as string[];
  const payLine = pay.length > 0
    ? `${pay.join(' · ')} — تختار عند إتمام الطلب.`
    : 'طرق الدفع المتاحة تظهر عند إتمام الطلب.';

  return (
    <>
      <StoreHero
        name={store.name}
        logoUrl={logo}
        bannerUrl={banner}
        description={chrome.description}
        whatsapp={chrome.whatsapp}
        productCount={latest?.length ?? 0}
        categoryCount={categories?.length ?? 0}
      />

      {/* ★ خلفية بيضاء متّصلة من هنا حتى التذييل: الفاصل الرمادي كان
          يقطع الصفحة ويصنع «فراغًا» بصريًا قبل التذييل. */}
      <div className="bg-white">
        <div className="mx-auto max-w-6xl px-4">
          {/* ───── التصنيفات ───── */}
          {categories && categories.length > 0 && (
            <section className="py-10 sm:py-12">
              <SectionHead title="تسوّق حسب التصنيف" />
              <ul className="mt-5 grid grid-cols-2 gap-2.5 [&>*]:min-w-0
                             sm:grid-cols-3 lg:grid-cols-4">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link href={`/categories/${c.slug}`}
                          className="group flex h-14 items-center justify-between gap-2
                                     rounded-lg border border-ink-200 bg-white px-4
                                     transition-colors hover:border-teal-600">
                      <span className="truncate text-[14px] font-semibold text-ink-900">
                        {c.name}
                      </span>
                      <ArrowLeft size={16} aria-hidden
                                 className="flip-rtl shrink-0 text-ink-300
                                            transition-colors group-hover:text-teal-700" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ───── العروض: لا تظهر إن لم توجد ───── */}
          {onSale.length > 0 && (
            <section className="border-t border-ink-200 py-10 sm:py-12">
              <SectionHead title="عروض حالية"
                           subtitle="بأسعار أقلّ من سعرها المعتاد." />
              <div className="mt-6">
                <ProductShowcase products={onSale} host={host} emptyTitle="" />
              </div>
            </section>
          )}

          {/* ───── المنتجات ───── */}
          <section className="border-t border-ink-200 py-10 sm:py-12">
            <SectionHead title="منتجات المتجر"
                         href={latest && latest.length > 0 ? '/products' : undefined}
                         hrefLabel="عرض الكل" />
            <div className="mt-6">
              <ProductShowcase
                products={latest ?? []} host={host}
                emptyTitle="لا توجد منتجات متاحة حاليًا"
                emptyDescription="تابع المتجر — ستُعرض المنتجات هنا فور إضافتها." />
            </div>
          </section>
        </div>

        {/* ───── مزايا المتجر: شريط مختلف بصريًا عن البطاقات ─────
            ★ لا بطاقات هنا: تكرار شكل البطاقة يجعل الصفحة قائمة
            مربّعات. شريط بخلفية رمادية وأعمدة نصّية يفصل القسم
            بصريًا ويصل الصفحة بالتذييل بلا فجوة بيضاء. */}
        <section className="border-t border-ink-200 bg-ink-50">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
            <Benefit Icon={Truck} title="توصيل داخل المدن"
                     body="رسوم التوصيل تظهر أمامك قبل تأكيد الطلب." />
            <Benefit Icon={Wallet} title="ادفع كما يناسبك" body={payLine} />
            <Benefit Icon={ShieldCheck} title="تتبّع طلبك"
                     body="برقم الطلب ورقم هاتفك — بلا إنشاء حساب." />
          </div>
        </section>

        {/* ★ يغلق الصفحة بنداء، ويملأ المسافة التي كانت تُترك بيضاء
            بين آخر منتج والتذييل في المتاجر قليلة المحتوى. */}
        {/* ★ `banner` نفسه الممرَّر إلى الافتتاحية: مصدر واحد
            لمكانين، فلا يفترقان أبدًا. */}
        <StoreContact storeName={store.name}
                      whatsapp={chrome.whatsapp}
                      phone={chrome.contactPhone}
                      coverUrl={banner} />
      </div>
    </>
  );
}

/** ترويسة قسم — عنوان، ووصف اختياري، ورابط «عرض الكل» اختياري. */
function SectionHead({ title, subtitle, href, hrefLabel }: {
  title: string; subtitle?: string; href?: string; hrefLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[20px] font-bold leading-tight text-ink-900 sm:text-[24px]">
          {title}
        </h2>
        {subtitle && <p className="mt-1.5 text-[13px] text-ink-500">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href}
              className="shrink-0 text-[13px] font-semibold text-teal-700
                         underline underline-offset-4 hover:text-teal-600">
          {hrefLabel ?? 'عرض الكل'}
        </Link>
      )}
    </div>
  );
}

/** ميزة واحدة في شريط المزايا. */
function Benefit({ Icon, title, body }: {
  Icon: typeof Truck; title: string; body: string;
}) {
  return (
    <div className="flex gap-3.5">
      <span className="grid size-11 shrink-0 place-items-center rounded-lg
                       bg-white text-teal-700 ring-1 ring-ink-200">
        <Icon size={19} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-ink-900">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{body}</p>
      </div>
    </div>
  );
}
