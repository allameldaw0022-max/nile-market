'use client';
import { useState } from 'react';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { publicUrl } from '@/lib/media/url';

export type GalleryImage = {
  bucket: string;
  path: string;
  blur_data_url: string | null;
};

/**
 * معرض صور المنتج.
 *
 * ★★ لماذا وُجد: الصفحة كانت ترسم حتى خمس صور مصغّرة بوسم `<li>` بلا
 * نقر ولا حالة، والصورة الكبيرة تبقى `images[0]` أبدًا. فتاجرٌ رفع
 * خمس صور يرى الزبون واحدة وأربعة مربّعات لا تستجيب — عطبٌ مرئيّ في
 * كل صفحة منتج، لا ميزة ناقصة.
 *
 * ★ الصورة الأولى تبقى `priority` ومُصيَّرة خادميًّا كما كانت: مؤشّر
 * LCP لا يتغيّر، والتبديل وحده على العميل.
 *
 * ★ وأزرار حقيقية لا `<li>` قابلة للنقر: يصلها التركيز بلوحة
 * المفاتيح، و`aria-current` يقول أيّها المعروضة.
 */
export function ProductGallery({ images, alt }: {
  images: GalleryImage[];
  alt: string;
}) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  return (
    <div className="space-y-2">
      <div className="relative aspect-square overflow-hidden rounded-lg
                      border border-ink-200 bg-ink-100">
        {current ? (
          <Image
            src={publicUrl(current.bucket, current.path)}
            alt={alt}
            fill
            /* ★ الأولوية للأولى وحدها: هي عنصر LCP، وما بعدها يُجلب
                 بعد نقر الزبون فلا يزاحمها. */
            priority={active === 0}
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            placeholder={current.blur_data_url ? 'blur' : 'empty'}
            blurDataURL={current.blur_data_url ?? undefined}
          />
        ) : (
          <div className="grid h-full place-items-center text-ink-400">
            <ImageOff size={36} strokeWidth={1.5} />
          </div>
        )}
      </div>

      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2">
          {images.slice(0, 5).map((m, i) => (
            <li key={m.path}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`عرض الصورة ${i + 1} من ${Math.min(images.length, 5)}`}
                aria-current={i === active ? 'true' : undefined}
                className={`relative block aspect-square w-full overflow-hidden rounded-md
                            border bg-ink-100 transition-colors
                            ${i === active ? 'border-teal-600' : 'border-ink-200 hover:border-ink-400'}`}
              >
                <Image src={publicUrl(m.bucket, m.path)} alt="" fill sizes="80px"
                       className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
