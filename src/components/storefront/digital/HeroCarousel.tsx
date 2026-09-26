'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ThemeBanner } from '@/lib/tenant/chrome';

const publicUrl = (bucket: string, path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

/**
 * لافتة المتجر الرقمي.
 *
 * ★ بنر واحد ⇒ لا أزرار ولا مؤشّرات ولا مؤقّت: دوّارٌ بعنصر واحد
 * ضجيجٌ لا فائدة فيه. وهي الحالة الشائعة (المحتوى الابتدائي بنر واحد).
 *
 * ★ والبنر بلا صورة ليس فراغًا: خلفية Charcoal بهوية سوق النيل مع
 * لمسة ذهبية على الحدّ. لا نخترع صورةً، ولا نستعمل شعار علامة لا
 * نملك حقوقها.
 *
 * ★ والدوران يتوقّف لمن طلب تقليل الحركة، ولمن يحوّم بالمؤشّر.
 */
export function HeroCarousel({ banners, storeName }: {
  banners: ThemeBanner[]; storeName: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const many = banners.length > 1;

  useEffect(() => {
    if (!many || paused) return;
    if (typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % banners.length), 6000);
    return () => window.clearInterval(id);
  }, [many, paused, banners.length]);

  if (banners.length === 0) return null;
  const b = banners[Math.min(index, banners.length - 1)];
  const img = b.bucket && b.path ? publicUrl(b.bucket, b.path) : null;

  return (
    <section aria-label="عروض المتجر" className="pt-3 sm:pt-5"
             onMouseEnter={() => setPaused(true)}
             onMouseLeave={() => setPaused(false)}>
      <div className="relative overflow-hidden rounded-xl"
           style={{ background: 'var(--d-invert-bg)',
                    border: '1px solid var(--d-border)' }}>
        <div className="relative aspect-[16/9] w-full sm:aspect-[21/8]">
          {img ? (
            <Image src={img} alt={b.title ?? storeName} fill priority
                   sizes="(max-width: 640px) 100vw, 1152px"
                   placeholder={b.blur ? 'blur' : 'empty'}
                   blurDataURL={b.blur ?? undefined}
                   className="object-cover" />
          ) : (
            <div aria-hidden className="absolute inset-0"
                 style={{ background: 'var(--d-invert-bg)',
                          borderBottom: '3px solid var(--d-gold)' }} />
          )}

          {/* طبقة قراءة صلبة لا تدرّج: النصّ يجب أن يُقرأ فوق أيّ صورة */}
          {(b.title || b.description || b.ctaLabel) && (
            <div className="absolute inset-0 flex items-end">
              <div className="w-full p-4 sm:p-7"
                   style={{ background: img ? 'rgb(23 25 28 / 0.62)' : 'transparent' }}>
                {b.title && (
                  <p className="text-[19px] font-bold leading-tight text-white
                                sm:text-[26px]">
                    {b.title}
                  </p>
                )}
                {b.description && (
                  <p className="mt-1.5 line-clamp-2 max-w-xl text-[13px] leading-relaxed
                                text-white/85 sm:text-[15px]">
                    {b.description}
                  </p>
                )}
                {b.ctaLabel && b.ctaHref && (
                  <Link href={b.ctaHref}
                        className="mt-3.5 inline-flex h-10 items-center rounded-md px-4
                                   text-[14px] font-bold transition-colors sm:h-11 sm:px-5"
                        style={{ background: 'var(--d-accent-surface)',
                                 color: 'var(--d-on-accent)' }}>
                    {b.ctaLabel}
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {many && (
          <>
            <button type="button" aria-label="السابق"
                    onClick={() => setIndex((i) => (i - 1 + banners.length) % banners.length)}
                    className="absolute end-2 top-1/2 grid size-9 -translate-y-1/2
                               place-items-center rounded-full text-white"
                    style={{ background: 'rgb(23 25 28 / 0.55)' }}>
              <ChevronRight size={18} aria-hidden />
            </button>
            <button type="button" aria-label="التالي"
                    onClick={() => setIndex((i) => (i + 1) % banners.length)}
                    className="absolute start-2 top-1/2 grid size-9 -translate-y-1/2
                               place-items-center rounded-full text-white"
                    style={{ background: 'rgb(23 25 28 / 0.55)' }}>
              <ChevronLeft size={18} aria-hidden />
            </button>
            <div className="absolute bottom-2.5 start-1/2 flex -translate-x-1/2 gap-1.5">
              {banners.map((x, i) => (
                <button key={x.id} type="button"
                        aria-label={`البنر ${i + 1}`}
                        aria-current={i === index ? 'true' : undefined}
                        onClick={() => setIndex(i)}
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: i === index ? 20 : 6,
                                 background: i === index ? '#FFFFFF' : 'rgb(255 255 255 / 0.5)' }} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
