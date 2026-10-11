'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { formatMoney } from '@/lib/money/format';
import { QuickAdd } from './QuickAdd';
import { RatingSummary } from './Stars';
import { WishlistButton } from './WishlistButton';

type ImageRow = {
  media_file_id: string; is_primary: boolean;
  media_files: { path: string; bucket: string; blur_data_url: string | null } | null;
};

export type StorefrontProduct = {
  id: string; name: string; slug: string;
  price: number; compare_at_price: number | null;
  has_variants?: boolean | null;
  track_inventory?: boolean | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  /** عمودٌ منشور يصونه محفّز (0064/0065) — لا تضمينٌ لا يقرأه الزائر. */
  in_stock?: boolean | null;
  product_images?: ImageRow[] | null;
};

const publicUrl = (bucket: string, path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

/**
 * بطاقة المنتج.
 *
 * ★ الصورة هي البطل: نسبة ٤:٥ رأسية تعطيها مساحة أكبر من المربّع على
 * الشبكة نفسها، وهي النسبة التي يصوّر بها التجّار منتجاتهم بالهاتف.
 *
 * ★ حالة المخزون تُعرض حين تعني شيئًا فقط: «نفد» يمنع الشراء،
 * و«بقي ٣» يستعجل، وأي رقم فوق ذلك ضوضاء تزاحم السعر.
 *
 * ★ الإجراءات تظهر لما لها وظيفة فعلية: القلب يحفظ في مفضّلة
 * المستخدم عبر مسار خادمي حقيقي، والإضافة السريعة لا تظهر لمنتج
 * بخيارات. لا أيقونة زخرفية هنا.
 */
export function ProductCard({ product, host, priority = false, saved, signedIn }: {
  product: StorefrontProduct; host: string; priority?: boolean;
  saved?: boolean; signedIn?: boolean;
}) {
  const img = product.product_images?.find((i) => i.is_primary) ?? product.product_images?.[0];
  const media = img?.media_files ?? null;

  const price = Number(product.price);
  const was = product.compare_at_price != null ? Number(product.compare_at_price) : null;
  const hasDiscount = was != null && was > price;
  const off = hasDiscount ? Math.round(((was - price) / was) * 100) : 0;

  const ratingCount = product.rating_count ?? 0;
  const ratingAvg = product.rating_avg == null ? null : Number(product.rating_avg);

  // ★★★ كان التوفّر يُقرأ من `inventory(quantity, reserved)`، و`inventory`
  //    عليها RLS بلا سياسة لـanon ⇒ التضمين يعود فارغًا للزائر، فـ
  //    `inv == null` ⇒ `tracked = false` ⇒ البطاقة تَعِد بالشراء حتى
  //    لمنتجٍ نفد فعلًا. والعمود المنشور يقول الحقيقة لكل زائر.
  //
  // ★ و«بقي N فقط» سقط معه: الرصيد الدقيق بيانُ تاجرٍ خاصّ لا يُنشر،
  //   والشارة لم تكن تظهر لزائرٍ قطّ أصلًا (كان `available` دائمًا null).
  const tracked = product.track_inventory !== false;
  const soldOut = tracked && product.in_stock === false;

  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-lg
                        border border-ink-200 bg-white transition-all duration-200
                        hover:border-ink-300 hover:shadow-sm">
      {/* ★ القلب خارج الرابط وفوق الصورة: داخل الرابط كان كل ضغط
          عليه يفتح صفحة المنتج أيضًا. */}
      <div className="absolute end-2 top-2 z-10">
        <WishlistButton host={host} productId={product.id} label={product.name}
                        initial={saved} signedIn={signedIn} />
      </div>

      <Link href={`/products/${product.slug}`} className="flex flex-1 flex-col">
        <div className="relative aspect-[4/5] overflow-hidden bg-ink-50">
          {media ? (
            <Image
              src={publicUrl(media.bucket, media.path)}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-300
                         group-hover:scale-[1.04]"
              placeholder={media.blur_data_url ? 'blur' : 'empty'}
              blurDataURL={media.blur_data_url ?? undefined}
              priority={priority}
              loading={priority ? undefined : 'lazy'}
            />
          ) : (
            /* ★ حالة «بلا صورة» مصمَّمة لا مربّع مكسور: خلفية هادئة
               وأيقونة ونصّ — البطاقة تبقى متّسقة مع جاراتها. */
            <div className="grid h-full place-items-center gap-1.5 bg-ink-50 text-ink-300">
              <ImageOff size={26} strokeWidth={1.5} aria-hidden />
              <span className="text-[11px] font-medium text-ink-500">لا توجد صورة</span>
            </div>
          )}

          {hasDiscount && !soldOut && (
            <span className="absolute start-2 top-2 rounded-xs bg-gold-500
                             px-2 py-0.5 text-[11px] font-bold tabular text-ink-900">
              −{off}٪
            </span>
          )}
          {soldOut && (
            <span className="absolute inset-0 grid place-items-center bg-white/80">
              <span className="rounded-xs bg-ink-800 px-3 py-1.5
                               text-[12px] font-semibold text-white">نفد المخزون</span>
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:p-3.5">
          <h3 className="line-clamp-2 min-h-[2.4em] text-[13px] font-medium
                         leading-snug text-ink-800 transition-colors
                         group-hover:text-teal-700 sm:text-[14px]">
            {product.name}
          </h3>

          {/* ★ لا شريط نجوم فارغ لمنتج جديد: خمس نجوم رمادية تُقرأ
              «قُيّم بصفر»، والبطاقات تصير كلّها سطرًا أطول بلا معنى. */}
          {ratingCount > 0 && (
            <RatingSummary avg={ratingAvg} count={ratingCount} size={12} />
          )}

          <div className="mt-auto min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[16px] font-bold tabular leading-none text-ink-900
                               sm:text-[17px]">
                {formatMoney(price)}
              </span>
              {hasDiscount && (
                <span className="text-[12px] tabular text-ink-500 line-through">
                  {formatMoney(was)}
                </span>
              )}
            </p>
          </div>
        </div>
      </Link>

      {/* ★ النداء زرّ ممتدّ أسفل البطاقة لا أيقونة عائمة فوق السعر:
          العائمة كانت تزاحم النصّ وتخفيه على الشاشات الضيّقة. ولا
          يظهر لمنتج بخيارات — اختيار المقاس نيابةً عن العميل خطأ. */}
      {!soldOut && !product.has_variants && (
        <div className="px-3 pb-3 sm:px-3.5 sm:pb-3.5">
          <QuickAdd host={host} productId={product.id} label={product.name} variant="wide" />
        </div>
      )}
    </article>
  );
}
