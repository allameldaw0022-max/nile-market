import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, ImageOff, ShieldCheck, Truck } from 'lucide-react';
import { resolveStoreByHost } from '@/lib/tenant/resolve';
import { decodeSlugParam } from '@/lib/tenant/params';
import { createClient } from '@/lib/supabase/server';
import { AddToCartButton } from '@/components/storefront/AddToCartButton';
import { WishlistButton } from '@/components/storefront/WishlistButton';
import { wishlistStateFor } from '@/lib/wishlist/actions';
import { getActor } from '@/lib/auth/actor';
import { ProductCard, type StorefrontProduct } from '@/components/storefront/ProductCard';
import { formatMoney } from '@/lib/money/format';
import { publicUrl } from '@/lib/media/url';
import { JsonLd } from '@/components/seo/JsonLd';
import { RatingSummary } from '@/components/storefront/Stars';
import { ProductReviews, type PublicReview, type ReviewViewerState }
  from '@/components/storefront/ProductReviews';
import { rpc } from '@/lib/supabase/rpc';
import { breadcrumbSchema, productSchema } from '@/lib/seo/schema';

export const revalidate = 60;

type ImageRow = {
  sort_order: number; is_primary: boolean;
  media_files: { bucket: string; path: string; blur_data_url: string | null } | null;
};

type ProductRow = {
  id: string; name: string; slug: string; description: string | null;
  price: number; compare_at_price: number | null; sku: string | null;
  track_inventory: boolean; category_id: string | null;
  rating_avg: number | null; rating_count: number;
  seo: Record<string, unknown>;
  product_images: ImageRow[] | null;
  product_variants: {
    id: string; name: string; price: number | null; is_active: boolean;
  }[] | null;
  inventory: { quantity: number; reserved: number }[] | null;
};

const SELECT =
  'id, name, slug, description, price, compare_at_price, sku, track_inventory, ' +
  'category_id, seo, rating_avg, rating_count, ' +
  'product_images(sort_order, is_primary, media_files(bucket, path, blur_data_url)), ' +
  'product_variants(id, name, price, is_active), ' +
  'inventory(quantity, reserved)';

async function load(host: string, slug: string) {
  const store = await resolveStoreByHost(host);
  if (!store) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('products').select(SELECT)
    .eq('store_id', store.storeId).eq('slug', slug)
    .eq('status', 'active').is('deleted_at', null)
    .maybeSingle();

  return data ? { store, product: data as unknown as ProductRow } : null;
}

export async function generateMetadata(
  { params }: PageProps<'/sites/[host]/products/[slug]'>,
): Promise<Metadata> {
  const { host, slug } = await params;
  const found = await load(host, decodeSlugParam(slug));
  if (!found) return { title: 'المنتج غير موجود' };

  const { store, product } = found;
  const canonical = `https://${store.primaryHost}/products/${product.slug}`;
  const cover = pickCover(product);
  const description = (product.description ?? '').slice(0, 160) || product.name;

  return {
    title: `${product.name} — ${store.name}`,
    description,
    alternates: { canonical },
    openGraph: {
      title: product.name, description, url: canonical,
      siteName: store.name, type: 'website', locale: 'ar_SD',
      images: cover ? [publicUrl(cover.bucket, cover.path)] : undefined,
    },
  };
}

export default async function ProductPage(
  { params }: PageProps<'/sites/[host]/products/[slug]'>,
) {
  const { host, slug } = await params;
  const found = await load(host, decodeSlugParam(slug));
  if (!found) notFound();

  const { store, product } = found;
  const images = [...(product.product_images ?? [])]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
    .map((i) => i.media_files)
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const stock = (product.inventory ?? []).reduce(
    (sum, i) => sum + Math.max(i.quantity - i.reserved, 0), 0);
  const available = product.track_inventory ? stock : 999;

  const hasDiscount = product.compare_at_price != null
    && Number(product.compare_at_price) > Number(product.price);

  const related = await loadRelated(store.storeId, product.category_id, product.id);
  const { reviews, viewer } = await loadReviews(product.id);
  const ratingAvg = product.rating_avg == null ? null : Number(product.rating_avg);

  // حالة المفضّلة لهذا المنتج وللمنتجات المشابهة في نداء واحد
  const [actor, saved] = await Promise.all([
    getActor(),
    wishlistStateFor([product.id, ...related.map((p) => p.id)]),
  ]);
  const signedIn = actor.kind === 'user';

  // بيانات منظَّمة: تظهر النتيجة في جوجل بسعرها وتوفّرها (§22).
  // التوفّر من المخزون الحقيقي، ومتجر منتهي الاشتراك يُعلَن «طلب
  // مسبق» لا «متوفّر»: إعلان توفّر لا يمكن شراؤه يُعاقَب عليه (D14).
  const canonical = `https://${store.primaryHost}/products/${product.slug}`;
  const schema = productSchema({
    name: product.name,
    description: product.description,
    sku: product.sku,
    price: Number(product.price),
    image: images[0] ? publicUrl(images[0].bucket, images[0].path) : null,
    url: canonical,
    storeName: store.name,
    inStock: product.track_inventory ? stock > 0 : null,
    canBuy: store.canCheckout,
    ratingAvg,
    ratingCount: product.rating_count,
  });

  const trail = breadcrumbSchema(store.primaryHost, [
    { name: 'الرئيسية', path: '/' },
    { name: 'المنتجات', path: '/products' },
    { name: product.name, path: `/products/${product.slug}` },
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <JsonLd data={schema} />
      <JsonLd data={trail} />

      <nav className="flex items-center gap-1 text-sm text-ink-500" aria-label="المسار">
        <Link href="/" className="hover:text-teal-700">الرئيسية</Link>
        <ChevronRight size={14} />
        <Link href="/products" className="hover:text-teal-700">المنتجات</Link>
      </nav>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <div className="relative aspect-square overflow-hidden rounded-lg
                          border border-ink-200 bg-ink-100">
            {images[0] ? (
              <Image src={publicUrl(images[0].bucket, images[0].path)} alt={product.name}
                     fill priority sizes="(max-width: 768px) 100vw, 50vw"
                     className="object-cover"
                     placeholder={images[0].blur_data_url ? 'blur' : 'empty'}
                     blurDataURL={images[0].blur_data_url ?? undefined} />
            ) : (
              <div className="grid h-full place-items-center text-ink-400">
                <ImageOff size={36} strokeWidth={1.5} />
              </div>
            )}
          </div>

          {images.length > 1 && (
            <ul className="grid grid-cols-5 gap-2">
              {images.slice(1, 6).map((m) => (
                <li key={m.path}
                    className="relative aspect-square overflow-hidden rounded-md
                               border border-ink-200 bg-ink-100">
                  <Image src={publicUrl(m.bucket, m.path)} alt="" fill sizes="80px"
                         className="object-cover" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h1 className="text-xl font-extrabold text-ink-900 sm:text-2xl">{product.name}</h1>

          {product.rating_count > 0 && (
            <a href="#reviews" className="mt-2 inline-flex">
              <RatingSummary avg={ratingAvg} count={product.rating_count} size={15} />
            </a>
          )}

          <div className="mt-3 flex items-baseline gap-3">
            <p className="text-2xl font-extrabold text-teal-700 tabular">
              {formatMoney(product.price)}
            </p>
            {hasDiscount && (
              <p className="text-base text-ink-400 line-through tabular">
                {formatMoney(product.compare_at_price)}
              </p>
            )}
          </div>

          {product.description && (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-700">
              {product.description}
            </p>
          )}

          <div className="mt-6">
            <AddToCartButton host={host} productId={product.id} available={available}
                             disabled={!store.canCheckout}
                             disabledNote="هذا المتجر غير متاح للشراء حاليًا — يمكنك التواصل معه." />
          </div>

          {/* الحفظ متاح حتى حين يتوقّف الشراء: المتجر مرئي والاشتراك
              منتهٍ (D14) لا يمنع الزبون من تعليم ما يريده لاحقًا. */}
          <div className="mt-3">
            <WishlistButton host={host} productId={product.id} label={product.name}
                            initial={saved.has(product.id)} signedIn={signedIn}
                            variant="full" />
          </div>

          <ul className="mt-6 space-y-2 text-sm text-ink-500">
            <li className="flex items-center gap-2">
              <Truck size={15} /> التوصيل داخل المدن المحددة من المتجر
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck size={15} /> الدفع عند الاستلام أو تحويل بنكي
            </li>
          </ul>
        </div>
      </div>

      <div id="reviews" className="scroll-mt-20">
        <ProductReviews host={host} productId={product.id} slug={product.slug}
                        avg={ratingAvg} count={product.rating_count}
                        reviews={reviews} viewer={viewer} />
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="font-bold text-ink-900">منتجات مشابهة</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} host={host}
                           saved={saved.has(p.id)} signedIn={signedIn} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

async function loadRelated(
  storeId: string, categoryId: string | null, excludeId: string,
): Promise<StorefrontProduct[]> {
  if (!categoryId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('products')
    .select('id, name, slug, price, compare_at_price, rating_avg, rating_count, ' +
            'product_images(media_file_id, is_primary, ' +
            'media_files(path, bucket, blur_data_url))')
    .eq('store_id', storeId).eq('category_id', categoryId)
    .eq('status', 'active').is('deleted_at', null)
    .neq('id', excludeId).limit(4);
  return (data ?? []) as unknown as StorefrontProduct[];
}

/**
 * التقييمات المنشورة وحالة الزائر — نداءان متوازيان.
 *
 * ★ `product_review_state` تُنادى للجميع: للزائر تعيد «auth» بلا
 * أي معلومة عن طلبات أحد، فلا يختلف شكل الطلب بين مشترٍ وغيره.
 */
async function loadReviews(productId: string): Promise<{
  reviews: PublicReview[]; viewer: ReviewViewerState;
}> {
  const supabase = await createClient();
  const [listRes, stateRes] = await Promise.all([
    rpc(supabase, 'product_reviews_page', { p_product_id: productId, p_limit: 10 }),
    rpc(supabase, 'product_review_state', { p_product_id: productId }),
  ]);

  const state = stateRes.data?.[0] ?? null;
  return {
    reviews: listRes.data ?? [],
    viewer: {
      canReview: state?.can_review ?? false,
      reason: state?.reason ?? 'auth',
      myRating: state?.my_rating ?? null,
      myBody: state?.my_body ?? null,
      myHidden: state?.my_status === 'hidden',
    },
  };
}

function pickCover(product: ProductRow) {
  const img = product.product_images?.find((i) => i.is_primary)
    ?? product.product_images?.[0];
  return img?.media_files ?? null;
}
