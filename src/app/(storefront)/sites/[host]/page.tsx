import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/States';
import { ProductCard } from '@/components/storefront/ProductCard';

export const revalidate = 60;

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

export default async function StoreHome({ params }: PageProps<'/sites/[host]'>) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  const supabase = await createClient();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from('categories')
      .select('id, name, slug')
      .eq('store_id', store.storeId).eq('is_active', true).is('deleted_at', null)
      .order('sort_order').limit(12),
    // استعلام واحد مع العلاقات ⇒ لا N+1 (§18.3)
    supabase.from('products')
      .select('id, name, slug, price, compare_at_price, product_images(media_file_id, is_primary, media_files(path, bucket, blur_data_url))')
      .eq('store_id', store.storeId).eq('status', 'active').is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <section className="rounded-[--radius-xl] bg-gradient-to-l from-teal-600 to-teal-700 px-6 py-10 text-white">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{store.name}</h1>
        <p className="mt-2 max-w-lg text-sm text-white/85">
          تصفّح منتجاتنا واطلب بسهولة — التوصيل متاح داخل المدن المحددة.
        </p>
      </section>

      {categories && categories.length > 0 && (
        <section className="mt-8">
          <h2 className="font-bold text-ink-900">التصنيفات</h2>
          <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {categories.map((c) => (
              <Link key={c.id} href={`/categories/${c.slug}`}
                    className="shrink-0 rounded-full border border-ink-300 bg-white px-4 py-2
                               text-sm font-bold text-ink-700 hover:border-teal-600 hover:text-teal-700">
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-ink-900">أحدث المنتجات</h2>
          <Link href="/products" className="text-sm font-bold text-teal-700 hover:underline">
            عرض الكل
          </Link>
        </div>

        {!products || products.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Package size={36} strokeWidth={1.5} />}
              title="لا توجد منتجات بعد"
              description="سيضيف المتجر منتجاته قريبًا."
            />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} priority={i === 0} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
