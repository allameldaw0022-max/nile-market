import Link from 'next/link';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { formatMoney } from '@/lib/money/format';
import { QuickAdd } from './QuickAdd';
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
  inventory?: { quantity: number; reserved: number }[] | null;
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
export function ProductCard({ product, host, priority = false, saved = false, signedIn = false }: {
  product: StorefrontProduct; host: string; priority?: boolean;
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
    <article className="group relative flex flex-col overflow-hidden rounded-lg
                        border border-ink-200 bg-white transition-colors hover:border-ink-300">
      <Link href={`/products/${product.slug}`} className="flex flex-1 flex-col">
        <div className="relative aspect-[4/5] overflow-hidden bg-ink-100">
          {media ? (
            <Image
              src={publicUrl(media.bucket, media.path)}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              placeholder={media.blur_data_url ? 'blur' : 'empty'}
              blurDataURL={media.blur_data_url ?? undefined}
              priority={priority}
              loading={priority ? undefined : 'lazy'}
            />
          ) : (
            <div className="grid h-full place-items-center text-ink-300">
              <ImageOff size={28} strokeWidth={1.5} aria-hidden />
            </div>
          )}

          {hasDiscount && !soldOut && (
            <span className="absolute start-2 top-2 rounded-xs bg-gold-500
                             px-1.5 py-0.5 text-[11px] font-bold tabular text-ink-900">
              −{off}٪
            </span>
          )}
          {soldOut && (
            <span className="absolute inset-0 grid place-items-center bg-white/75">
              <span className="rounded-xs bg-ink-800 px-2.5 py-1
                               text-[12px] font-semibold text-white">نفد المخزون</span>
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-3">
          <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-ink-900">
            {product.name}
          </h3>
          <div className="mt-auto pt-2">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[15px] font-bold tabular text-ink-900">{formatMoney(price)}</span>
              {hasDiscount && (
                <span className="text-[12px] tabular text-ink-400 line-through">{formatMoney(was)}</span>
              )}
            </p>
            {low && (
              <p className="mt-1 text-[11px] font-medium text-gold-700 tabular">
                بقي {available} فقط
              </p>
            )}
          </div>
        </div>
      </Link>

      {/* الإجراءات: الحفظ دائمًا، والإضافة السريعة لمنتج بلا خيارات ومتوفّر */}
      <div className="absolute bottom-3 end-3 flex gap-1.5">
        {!soldOut && !product.has_variants && (
          <QuickAdd host={host} productId={product.id} label={product.name} />
        )}
        <WishlistButton host={host} productId={product.id} label={product.name}
                        initial={saved} signedIn={signedIn} />
      </div>
    </article>
  );
}
