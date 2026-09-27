'use client';
import Image from 'next/image';
import Link from 'next/link';
import { formatMoney } from '@/lib/money/format';
import type { StorefrontProduct } from '../ProductCard';

const publicUrl = (bucket: string, path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

/**
 * بطاقة منتج رقمي.
 *
 * ★ تختلف عن بطاقة المتجر العادي في ثلاثة أشياء فقط، وكلٌّ منها لسبب:
 *   · لا «إضافة سريعة»: الشراء الرقمي يمرّ بباقةٍ وبيانات شحن، فزرٌّ
 *     يضيف إلى السلّة من الشبكة يقود إلى طلبٍ ناقص.
 *   · لا حالة مخزون: المنتج الرقمي بلا تتبّع، و«نفد» لا معنى له.
 *   · «يبدأ من» حين للمنتج باقات: السعر الظاهر أدنى الباقات لا سعر
 *     المنتج المجرَّد — وإلا ظُنّ أنّ الباقة الكبيرة بنفس الثمن.
 *
 * ★ والصورة الغائبة تعرض حرف المنتج على سطح الهوية — لا شعار علامة.
 */
export function DigitalProductCard({ product, host, priority = false, fromPrice }: {
  product: StorefrontProduct; host: string; priority?: boolean;
  fromPrice?: number | null;
}) {
  void host;
  const img = product.product_images?.find((i) => i.is_primary)
    ?? product.product_images?.[0];
  const media = img?.media_files ?? null;

  const base = fromPrice ?? Number(product.price);
  const was = product.compare_at_price != null ? Number(product.compare_at_price) : null;
  const hasDiscount = was != null && was > base;
  const off = hasDiscount ? Math.round(((was - base) / was) * 100) : 0;
  const many = product.has_variants === true;

  return (
    <Link href={`/products/${encodeURIComponent(product.slug)}`}
          className="group flex h-full flex-col overflow-hidden rounded-lg transition-shadow"
          style={{ background: 'var(--d-surface)',
                   border: '1px solid var(--d-border)',
                   boxShadow: 'var(--d-shadow)' }}>
      <span className="relative block aspect-square overflow-hidden"
            style={{ background: 'var(--d-surface-2)' }}>
        {media ? (
          <Image src={publicUrl(media.bucket, media.path)} alt={product.name} fill
                 priority={priority}
                 sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
                 placeholder={media.blur_data_url ? 'blur' : 'empty'}
                 blurDataURL={media.blur_data_url ?? undefined}
                 className="object-cover" />
        ) : (
          <span aria-hidden className="absolute inset-0 grid place-items-center
                                       text-[32px] font-bold"
                style={{ color: 'var(--d-accent)' }}>
            {product.name.trim().charAt(0) || '؟'}
          </span>
        )}
        {hasDiscount && (
          <span className="absolute end-2 top-2 rounded px-1.5 py-0.5 text-[11px]
                           font-bold"
                style={{ background: 'var(--d-danger-surface)', color: '#FFFFFF' }}>
            −{off}%
          </span>
        )}
      </span>

      <span className="flex flex-1 flex-col gap-1 p-2.5 sm:p-3">
        <span className="line-clamp-2 text-[13px] font-semibold leading-snug
                         sm:text-[14px]">
          {product.name}
        </span>
        <span className="mt-auto flex flex-wrap items-baseline gap-x-2">
          {many && (
            <span className="text-[11px]" style={{ color: 'var(--d-text-2)' }}>
              يبدأ من
            </span>
          )}
          <span className="tabular text-[15px] font-bold"
                style={{ color: 'var(--d-accent)' }}>
            {formatMoney(base)}
          </span>
          {hasDiscount && (
            <span className="tabular text-[12px] line-through"
                  style={{ color: 'var(--d-text-2)' }}>
              {formatMoney(was)}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
