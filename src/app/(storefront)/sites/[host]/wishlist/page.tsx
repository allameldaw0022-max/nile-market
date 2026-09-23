import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Heart } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { getActor } from '@/lib/auth/actor';
import { loadWishlist } from '@/lib/wishlist/actions';
import { ProductGrid } from '@/components/storefront/ProductGrid';
import { EmptyState } from '@/components/ui/States';
import { ErrorState } from '@/components/ui/States';
import { buttonClass } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: PageProps<'/sites/[host]/wishlist'>,
): Promise<Metadata> {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  return {
    title: 'المفضّلة',
    description: store ? `منتجاتك المحفوظة في ${store.name}` : undefined,
    // صفحة خاصّة بالمستخدم — لا تُفهرس
    robots: { index: false, follow: false },
  };
}

/**
 * مفضّلة المستخدم في هذا المتجر.
 *
 * ★ مقصورة على متجر الطلب: ما حُفظ في متجر آخر لا يظهر هنا. المتاجر
 * مستأجرون منفصلون، ومفضّلة موحّدة عبرها كانت ستكشف للتاجر أن زبونه
 * يتسوّق عند غيره.
 *
 * ★ الزائر لا يُمنع بصفحة خطأ بل يُدعى إلى الدخول ومعه مسار العودة —
 * فيعود إلى هذه الصفحة بعينها.
 */
export default async function WishlistPage(
  { params }: PageProps<'/sites/[host]/wishlist'>,
) {
  const { host } = await params;
  const store = await resolveStoreByHost(host);
  if (!store) notFound();

  const actor = await getActor();

  if (actor.kind !== 'user') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-[22px] font-bold text-ink-900">المفضّلة</h1>
        <div className="mt-6 rounded-lg border border-ink-200 bg-white px-6 py-12 text-center">
          <Heart size={34} strokeWidth={1.5} className="mx-auto text-ink-400" aria-hidden />
          <h2 className="mt-3 text-[16px] font-semibold text-ink-900">
            سجّل الدخول لتحفظ منتجاتك
          </h2>
          <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-relaxed text-ink-500">
            المفضّلة تبقى معك على كل أجهزتك ما دمت مسجّلًا، ولا تضيع بمسح
            بيانات المتصفّح.
          </p>
          {/* عنوان مطلق: الدخول على نطاق المنصّة، ورابط نسبيّ هنا
              يُعاد كتابته إلى مسار متجر غير موجود فيعطي 404. */}
          <a href={`https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}/login`}
             className={buttonClass('primary', 'md', 'mt-6')}>
            تسجيل الدخول
          </a>
        </div>
      </div>
    );
  }

  const res = await loadWishlist(host);
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <ErrorState title="تعذّر تحميل المفضّلة" description={res.message} />
      </div>
    );
  }

  const items = res.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink-900">المفضّلة</h1>
          <p className="mt-0.5 text-[14px] text-ink-500">
            {items.length > 0
              ? <>{items.length} منتجًا محفوظًا في {store.name}</>
              : <>ما تحفظه من {store.name} يظهر هنا</>}
          </p>
        </div>
        <Link href="/products" className={buttonClass('outline', 'sm')}>
          تصفّح المنتجات
        </Link>
      </header>

      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState
            icon={<Heart size={36} strokeWidth={1.5} />}
            title="لا منتجات محفوظة بعد"
            description="اضغط على القلب في أي منتج ليظهر هنا."
            action={
              <Link href="/products" className={buttonClass('primary', 'sm')}>
                ابدأ التصفّح
              </Link>
            }
          />
        ) : (
          <ProductGrid
            host={host}
            emptyTitle=""
            products={items.map((i) => ({
              id: i.productId,
              name: i.name,
              slug: i.slug,
              price: i.price,
              compare_at_price: i.compareAtPrice,
              has_variants: i.hasVariants,
              track_inventory: i.trackInventory,
              inventory: [{ quantity: i.available, reserved: 0 }],
              product_images: i.imageBucket && i.imagePath
                ? [{
                    media_file_id: i.productId,
                    is_primary: true,
                    media_files: {
                      bucket: i.imageBucket,
                      path: i.imagePath,
                      blur_data_url: i.imageBlur,
                    },
                  }]
                : null,
            }))}
          />
        )}
      </div>
    </div>
  );
}
