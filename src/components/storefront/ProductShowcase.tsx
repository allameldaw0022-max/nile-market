import Link from 'next/link';
import Image from 'next/image';
import { ImageOff, ArrowLeft } from 'lucide-react';
import { formatMoney } from '@/lib/money/format';
import { EmptyState } from '@/components/ui/States';
import { Package } from 'lucide-react';
import { ProductCard, type StorefrontProduct } from './ProductCard';
import { QuickAdd } from './QuickAdd';
import { WishlistButton } from './WishlistButton';

const publicUrl = (bucket: string, path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

/**
 * عرض المنتجات بتكوين يتبع عددها.
 *
 * ★★ المشكلة التي يحلّها: الشبكة الثابتة ٢/٣/٤ تفترض أن المتجر مليء.
 * متجر بمنتج واحد كان يعرضه في ربع الصفّ ويترك ثلاثة أرباعه بياضًا —
 * فيبدو المتجر مهجورًا وهو ليس كذلك. ومتجر بمنتجين يترك نصف الصفّ.
 * وهذه ليست حالة نادرة: كل متجر يبدأ بمنتج واحد.
 *
 * ★ فالتكوين يتغيّر بالعدد لا العكس:
 *   ١      → بطاقة عرض أفقية كبيرة: الصورة نصف والتفاصيل نصف.
 *   ٢–٣    → شبكة بعدد أعمدة يساوي العدد، داخل حاوية أضيق فتمتلئ.
 *   ٤ فأكثر → الشبكة الطبيعية ٢/٣/٤.
 *
 * ★ ولا يُخترع منتج لملء الفراغ. الفراغ يُعالَج بالتكوين لا بالكذب.
 *
 * ★★ ولم يبقَ فيه جلبٌ لبيانات زائر: كان يجلب `getActor()` و
 * `wishlistStateFor()` لأزرار المفضّلة، فكان كلّ عرضٍ للمنتجات —
 * في الرئيسية وكل المنتجات والتصنيف والبحث والمنتجات المشابهة —
 * يلمس `cookies()` ويُخرج المسار كلّه من التخزين. الأزرار الآن
 * تقرأ حالتها من `ViewerProvider` على العميل.
 */
export function ProductShowcase({ products, host, emptyTitle, emptyDescription }: {
  products: StorefrontProduct[];
  host: string;
  emptyTitle: string;
  emptyDescription?: string;
}) {
  if (products.length === 0) {
    return (
      <EmptyState icon={<Package size={36} strokeWidth={1.5} />}
                  title={emptyTitle} description={emptyDescription} />
    );
  }

  // `saved`/`signedIn` غير ممرَّرين: كل زرّ يقرأهما من سياق الزائر.
  return <ProductShowcaseView products={products} host={host} />;
}

/**
 * التكوين وحده، بلا جلب بيانات.
 *
 * ★ مفصول عن الغلاف أعلاه لسبب عملي: التكوين هو ما يُختبر بصريًا،
 * وربطه بجلب المفضّلة كان يجعل اختباره مستحيلًا بلا قاعدة حيّة.
 */
export function ProductShowcaseView({ products, host, saved, signedIn }: {
  products: StorefrontProduct[];
  host: string;
  /** يُمرَّران في الاختبارات البصرية وحدها؛ الإنتاج يقرأ من السياق. */
  saved?: Set<string>;
  signedIn?: boolean;
}) {
  if (products.length === 1) {
    return <FeaturedOne product={products[0]} host={host}
                        saved={saved?.has(products[0].id)} signedIn={signedIn} />;
  }

  // ★ أصناف Tailwind كاملة لا مركَّبة: المولِّد يقرأ النصّ ولا يرى
  // `lg:grid-cols-${n}` فتسقط القاعدة صامتةً.
  const shape = products.length === 2
    ? { wrap: 'mx-auto max-w-3xl', cols: 'grid-cols-2' }
    : products.length === 3
      ? { wrap: 'mx-auto max-w-5xl', cols: 'grid-cols-2 lg:grid-cols-3' }
      : { wrap: '', cols: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' };

  return (
    <div className={shape.wrap}>
      <div className={`grid gap-3 [&>*]:min-w-0 sm:gap-4 ${shape.cols}`}>
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} host={host} priority={i < 2}
                       saved={saved?.has(p.id)} signedIn={signedIn} />
        ))}
      </div>
    </div>
  );
}

/**
 * منتج واحد — بطاقة عرض لا بطاقة شبكة.
 *
 * ★ الصورة تأخذ نصف العرض على الحاسوب بنسبة ٤:٥ نفسها، والتفاصيل
 * النصف الآخر بهرمية صفحة منتج مصغّرة: الاسم، السعر، الحالة، نداءان.
 * على الهاتف يعود التكديس رأسيًا — صورة ثم تفاصيل.
 */
function FeaturedOne({ product, host, saved, signedIn }: {
  product: StorefrontProduct; host: string;
  saved?: boolean; signedIn?: boolean;
}) {
  const img = product.product_images?.find((i) => i.is_primary) ?? product.product_images?.[0];
  const media = img?.media_files ?? null;

  const price = Number(product.price);
  const was = product.compare_at_price != null ? Number(product.compare_at_price) : null;
  const hasDiscount = was != null && was > price;
  const off = hasDiscount ? Math.round(((was - price) / was) * 100) : 0;

  const inv = product.inventory?.[0];
  const tracked = product.track_inventory !== false && inv != null;
  const available = tracked ? Math.max(inv!.quantity - inv!.reserved, 0) : null;
  const soldOut = available !== null && available <= 0;
  const low = available !== null && available > 0 && available <= 3;

  return (
    <article className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <div className="grid md:grid-cols-2">
        <Link href={`/products/${product.slug}`}
              /* ★ 4:3 على الهاتف لا 4:5: النسبة الرأسية بعرض الشاشة
                 كاملًا كانت تبتلع الشاشة فتختفي التفاصيل والسعر تحت
                 الطيّة. ومن md يعود التقسيم نصفين فترجع الصورة رأسية. */
              className="relative block aspect-[4/3] overflow-hidden bg-ink-50
                         sm:aspect-[16/10] md:aspect-auto md:min-h-[26rem]">
          {media ? (
            <Image src={publicUrl(media.bucket, media.path)} alt={product.name}
                   fill priority sizes="(max-width: 768px) 100vw, 50vw"
                   className="object-cover"
                   placeholder={media.blur_data_url ? 'blur' : 'empty'}
                   blurDataURL={media.blur_data_url ?? undefined} />
          ) : (
            <div className="grid h-full place-items-center gap-2 text-ink-300">
              <ImageOff size={34} strokeWidth={1.5} aria-hidden />
              <span className="text-[12px] font-medium text-ink-400">لا توجد صورة</span>
            </div>
          )}
          {hasDiscount && !soldOut && (
            <span className="absolute start-3 top-3 rounded-xs bg-gold-500 px-2.5 py-1
                             text-[12px] font-bold tabular text-ink-900">
              −{off}٪
            </span>
          )}
          {soldOut && (
            <span className="absolute inset-0 grid place-items-center bg-white/80">
              <span className="rounded-xs bg-ink-800 px-3 py-1.5
                               text-[13px] font-semibold text-white">نفد المخزون</span>
            </span>
          )}
        </Link>

        <div className="flex flex-col justify-center gap-4 p-6 sm:p-8 lg:p-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">
              منتج المتجر
            </p>
            <h3 className="mt-2 text-[22px] font-bold leading-snug text-ink-900 sm:text-[26px]">
              <Link href={`/products/${product.slug}`} className="hover:text-teal-700">
                {product.name}
              </Link>
            </h3>
          </div>

          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[24px] font-bold tabular leading-none text-ink-900
                             sm:text-[28px]">
              {formatMoney(price)}
            </span>
            {hasDiscount && (
              <span className="text-[15px] tabular text-ink-400 line-through">
                {formatMoney(was)}
              </span>
            )}
          </p>

          {low && (
            <p className="text-[13px] font-semibold tabular text-gold-700">
              بقي {available} فقط
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <Link href={`/products/${product.slug}`}
                  className="inline-flex h-12 items-center gap-2 rounded-md bg-ink-900
                             px-6 text-[15px] font-semibold text-white
                             transition-colors hover:bg-ink-800">
              عرض التفاصيل
              <ArrowLeft size={17} className="flip-rtl" aria-hidden />
            </Link>
            {!soldOut && !product.has_variants && (
              <div className="w-36">
                <QuickAdd host={host} productId={product.id}
                          label={product.name} variant="wide" />
              </div>
            )}
            <WishlistButton host={host} productId={product.id} label={product.name}
                            initial={saved} signedIn={signedIn} />
          </div>
        </div>
      </div>
    </article>
  );
}
