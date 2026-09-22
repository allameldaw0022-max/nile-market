import Link from 'next/link';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { formatMoney } from '@/lib/money/format';

type ImageRow = {
  media_file_id: string; is_primary: boolean;
  media_files: { path: string; bucket: string; blur_data_url: string | null } | null;
};

export type StorefrontProduct = {
  id: string; name: string; slug: string;
  price: number; compare_at_price: number | null;
  product_images?: ImageRow[] | null;
};

const publicUrl = (bucket: string, path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

export function ProductCard({ product, priority = false }: {
  product: StorefrontProduct; priority?: boolean;
}) {
  const img =
    product.product_images?.find((i) => i.is_primary) ?? product.product_images?.[0];
  const media = img?.media_files ?? null;
  const hasDiscount =
    product.compare_at_price != null && Number(product.compare_at_price) > Number(product.price);

  return (
    <Link href={`/products/${product.slug}`}
          className="group flex flex-col overflow-hidden rounded-[--radius-lg]
                     border border-ink-200 bg-white transition-shadow hover:shadow-[--shadow-sm]">
      <div className="relative aspect-square bg-ink-100">
        {media ? (
          <Image
            src={publicUrl(media.bucket, media.path)}
            alt={product.name}
            fill
            // أحجام صحيحة ⇒ لا تحميل صورة أكبر مما يظهر (§18.4)
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
            placeholder={media.blur_data_url ? 'blur' : 'empty'}
            blurDataURL={media.blur_data_url ?? undefined}
            priority={priority}
            loading={priority ? undefined : 'lazy'}
          />
        ) : (
          <div className="grid h-full place-items-center text-ink-400">
            <ImageOff size={28} strokeWidth={1.5} />
          </div>
        )}
        {hasDiscount && (
          <span className="absolute top-2 start-2 rounded-full bg-gold-500 px-2 py-0.5
                           text-[11px] font-extrabold text-ink-900">
            خصم
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 text-sm font-bold text-ink-900">{product.name}</h3>
        <div className="mt-auto pt-2">
          <p className="font-extrabold text-teal-700 tabular">{formatMoney(product.price)}</p>
          {hasDiscount && (
            <p className="text-xs text-ink-400 line-through tabular">
              {formatMoney(product.compare_at_price)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
