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
      {/* ───── اللافتة: صورة التاجر أو شريط باسمه ───── */}
      <section className="border-b border-ink-200 bg-white">
        {banner ? (
          <div className="relative aspect-[16/6] w-full overflow-hidden bg-ink-100 sm:aspect-[16/5]">
            <Image src={banner} alt="" fill priority sizes="100vw" className="object-cover" />
          </div>
        ) : (
          <div className="bg-ink-800">
            <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
              <h1 className="text-[26px] font-bold text-white sm:text-[34px]">{store.name}</h1>
              {settings?.description && (
                <p className="prose-width mt-3 text-[15px] leading-relaxed text-white/70">
                  {settings.description}
                </p>
              )}
              <Link href="/products"
                    className="mt-6 inline-flex h-11 items-center gap-2 rounded-md
                               bg-white px-5 text-[14px] font-semibold text-ink-900
                               transition-colors hover:bg-ink-100">
                تصفّح المنتجات
                <ArrowLeft size={17} className="flip-rtl" aria-hidden />
              </Link>
            </div>
          </div>
        )}
      </section>

      <div className="mx-auto max-w-6xl px-4">
        {/* ───── التصنيفات ───── */}
        {categories && categories.length > 0 && (
          <nav aria-label="تصنيفات المتجر" className="border-b border-ink-200 py-5">
            <ul className="no-scrollbar flex gap-2 overflow-x-auto">
              {categories.map((c) => (
                <li key={c.id}>
                  <Link href={`/categories/${c.slug}`}
                        className="inline-flex h-10 shrink-0 items-center rounded-md
                                   border border-ink-200 bg-white px-4 text-[14px] font-medium
                                   text-ink-700 transition-colors hover:border-teal-600 hover:text-teal-700">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* ───── العروض: لا تظهر إن لم توجد ───── */}
        {onSale.length > 0 && (
          <section className="py-8">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[19px] font-bold text-ink-900">عروض حالية</h2>
                <p className="mt-1 text-[13px] text-ink-500">بأسعار أقلّ من سعرها المعتاد.</p>
              </div>
            </div>
            <div className="mt-4">
              <ProductGrid products={onSale} host={host} emptyTitle="" />
            </div>
          </section>
        )}

        {/* ───── أحدث المنتجات ───── */}
        <section className="border-t border-ink-200 py-8 first:border-0">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-[19px] font-bold text-ink-900">أحدث المنتجات</h2>
            <Link href="/products"
                  className="text-[13px] font-medium text-teal-700 underline underline-offset-4">
              عرض الكل
            </Link>
          </div>

          <div className="mt-4">
            {!latest || latest.length === 0 ? (
              <EmptyState icon={<Package size={36} strokeWidth={1.5} />}
                          title="لا توجد منتجات بعد"
                          description="سيضيف المتجر منتجاته قريبًا." />
            ) : (
              <ProductGrid products={latest} host={host} emptyTitle="" />
            )}
          </div>
        </section>

        {/* ───── شريط الخدمات: معلومات لا زخرفة ───── */}
        <section className="grid gap-5 border-t border-ink-200 py-8 sm:grid-cols-3">
          {[
            { Icon: Truck,       t: 'توصيل داخل المدن', b: 'رسوم التوصيل تظهر قبل تأكيد الطلب.' },
            { Icon: Wallet,      t: 'دفع يناسبك',       b: 'عند الاستلام أو تحويل بنكي أو بنكك.' },
            { Icon: ShieldCheck, t: 'تتبّع طلبك',       b: 'برقم الطلب وهاتفك، بلا حساب.' },
          ].map(({ Icon, t, b }) => (
            <div key={t} className="flex gap-3">
              <Icon size={19} className="mt-0.5 shrink-0 text-ink-400" aria-hidden />
              <div>
                <p className="text-[14px] font-semibold text-ink-900">{t}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500">{b}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
