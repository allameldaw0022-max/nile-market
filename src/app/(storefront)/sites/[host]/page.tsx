import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Package, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/States';
import { ProductGrid } from '@/components/storefront/ProductGrid';

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

  const [{ data: categories }, { data: latest }, { data: deals }, { data: settings }] =
    await Promise.all([
      supabase.from('categories')
        .select('id, name, slug')
        .eq('store_id', store.storeId).eq('is_active', true).is('deleted_at', null)
        .order('sort_order').limit(12),
      supabase.from('products')
        .select(
          'id, name, slug, price, compare_at_price, has_variants, track_inventory, inventory(quantity, reserved), product_images(media_file_id, is_primary, media_files(path, bucket, blur_data_url))')
        .eq('store_id', store.storeId).eq('status', 'active').is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(8),
      // العروض: ما له سعر قبل الخصم أعلى من سعره الحالي
      supabase.from('products')
        .select(
          'id, name, slug, price, compare_at_price, has_variants, track_inventory, inventory(quantity, reserved), product_images(media_file_id, is_primary, media_files(path, bucket, blur_data_url))')
        .eq('store_id', store.storeId).eq('status', 'active').is('deleted_at', null)
        .not('compare_at_price', 'is', null)
        .order('created_at', { ascending: false }).limit(4),
      supabase.from('stores')
        .select('description, banner_url, logo_url')
        .eq('id', store.storeId).maybeSingle(),
    ]);

  const onSale = (deals ?? []).filter(
    (p) => p.compare_at_price != null && Number(p.compare_at_price) > Number(p.price));
  const banner = settings?.banner_url ?? null;

  return (
    <>
      {/* ═══════════ الواجهة ═══════════
          ★ حالتان لا واحدة. إن رفع التاجر لافتة: صورته مع طبقة تدرّج
          **رأسية سوداء شفّافة** (لا لون مضاف) تحمل اسمه ووصفه ونداءه —
          صورة عارية بلا نداء لا تبيع. وإن لم يرفع: واجهة طباعية
          تعتمد على الاسم والوصف، ولا نخترع له صورة.
          ★ النداء واحد: تعدّد الأزرار يشتّت القرار. */}
      <section className="relative isolate overflow-hidden bg-ink-900">
        {banner && (
          <Image src={banner} alt="" fill priority sizes="100vw"
                 className="object-cover opacity-55" />
        )}
        <div className={banner
          ? 'absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/55 to-ink-900/10'
          : 'absolute inset-0'} aria-hidden />

        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20 lg:py-24">
          <div className="max-w-xl">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-gold-500">
              متجر إلكتروني
            </p>
            <h1 className="mt-3 text-[28px] font-bold leading-[1.2] text-white
                           sm:text-[38px] lg:text-[44px]">
              {store.name}
            </h1>
            {settings?.description && (
              <p className="mt-4 text-[15px] leading-relaxed text-white/75 sm:text-[16px]">
                {settings.description}
              </p>
            )}
            <Link href="/products"
                  className="mt-7 inline-flex h-12 items-center gap-2 rounded-md
                             bg-teal-500 px-6 text-[15px] font-semibold text-ink-900
                             transition-colors hover:bg-teal-600 hover:text-white
                             focus-visible:bg-teal-600 focus-visible:text-white">
              تصفّح المنتجات
              <ArrowLeft size={18} className="flip-rtl" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        {/* ───── التصنيفات: تنقّل المتجر لا أزرار ترتيب ───── */}
        {categories && categories.length > 0 && (
          <section className="py-10">
            <SectionHead title="تسوّق حسب التصنيف" />
            <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
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
          <section className="border-t border-ink-200 py-10">
            <SectionHead title="عروض حالية"
                         subtitle="بأسعار أقلّ من سعرها المعتاد."
                         href="/products" hrefLabel="كل المنتجات" />
            <div className="mt-5">
              <ProductGrid products={onSale} host={host} emptyTitle="" />
            </div>
          </section>
        )}

        {/* ───── أحدث المنتجات ───── */}
        <section className="border-t border-ink-200 py-10">
          <SectionHead title="أحدث المنتجات"
                       href={latest && latest.length > 0 ? '/products' : undefined}
                       hrefLabel="عرض الكل" />
          <div className="mt-5">
            {!latest || latest.length === 0 ? (
              <EmptyState icon={<Package size={36} strokeWidth={1.5} />}
                          title="لا توجد منتجات متاحة حاليًا"
                          description="تابع المتجر — ستُعرض المنتجات هنا فور إضافتها." />
            ) : (
              <ProductGrid products={latest} host={host} emptyTitle="" />
            )}
          </div>
        </section>

        {/* ───── شريط الخدمات: معلومات لا زخرفة ───── */}
        <section className="grid gap-6 border-t border-ink-200 py-10 sm:grid-cols-3">
          {[
            { Icon: Truck,       t: 'توصيل داخل المدن', b: 'رسوم التوصيل تظهر قبل تأكيد الطلب.' },
            { Icon: Wallet,      t: 'دفع يناسبك',       b: 'عند الاستلام أو تحويل بنكي أو بنكك.' },
            { Icon: ShieldCheck, t: 'تتبّع طلبك',       b: 'برقم الطلب وهاتفك، بلا حساب.' },
          ].map(({ Icon, t, b }) => (
            <div key={t} className="flex gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md
                               bg-ink-100 text-ink-700">
                <Icon size={18} aria-hidden />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-ink-900">{t}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{b}</p>
              </div>
            </div>
          ))}
        </section>
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
        <h2 className="text-[20px] font-bold leading-tight text-ink-900 sm:text-[22px]">
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
