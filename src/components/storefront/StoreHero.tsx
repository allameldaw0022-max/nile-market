import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, MessageCircle, Store } from 'lucide-react';
import { waNumber } from '@/lib/phone';

/**
 * هوية المتجر — القالب المشترك لكل المتاجر.
 *
 * ★ ثلاث حالات لا واحدة، وكلّها من بيانات التاجر الحقيقية:
 *   لافتة + شعار → الصورة خلفية بطبقة سوداء شفّافة والهوية فوقها.
 *   شعار بلا لافتة → تكوين طباعي والشعار بطاقةً بارزة.
 *   لا شيء       → الحرف الأول من اسم المتجر في مربّع — أقلّ ما يميّز
 *                  متجرًا عن صفحة، وليس صورة مخترعة.
 *
 * ★ لا يستهلك الشاشة: الحشوة 40–64px لا ارتفاع كامل. الافتتاحية
 * تُعرّف المتجر ثم تُفسح للمنتجات — وهي البضاعة لا الديكور.
 *
 * ★ لا لون مكتوب هنا خارج نظام التصميم: القالب واحد لكل المتاجر،
 * والتمييز يأتي من الشعار واللافتة والاسم لا من فرع في الكود.
 */
export function StoreHero({
  name, logoUrl, bannerUrl, description, whatsapp, productCount, categoryCount,
}: {
  name: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  description: string | null;
  whatsapp: string | null;
  productCount: number;
  categoryCount: number;
}) {
  const initial = name.trim().charAt(0) || '•';

  // ★ أرقام حقيقية فقط، ولا تُعرض الصفر: «0 منتج» إعلان عن الفراغ.
  const facts = [
    productCount > 0 && `${productCount} منتج`,
    categoryCount > 0 && `${categoryCount} تصنيف`,
  ].filter(Boolean) as string[];

  return (
    <section className="relative isolate overflow-hidden border-b border-ink-200 bg-ink-900">
      {bannerUrl && (
        <Image src={bannerUrl} alt="" fill priority sizes="100vw"
               className="object-cover opacity-45" />
      )}
      {bannerUrl && (
        <div aria-hidden
             className="absolute inset-0 bg-gradient-to-t from-ink-900
                        via-ink-900/75 to-ink-900/35" />
      )}

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:py-14 lg:py-16">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          {/* الشعار — أو الحرف الأول حين لا شعار */}
          <div className="shrink-0">
            {logoUrl ? (
              <Image src={logoUrl} alt="" width={96} height={96}
                     className="size-[72px] rounded-2xl object-cover
                                ring-1 ring-white/25 sm:size-24" />
            ) : (
              <span aria-hidden
                    className="grid size-[72px] place-items-center rounded-2xl
                               bg-white/10 text-[30px] font-bold text-white
                               ring-1 ring-white/25 sm:size-24 sm:text-[38px]">
                {initial}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold
                          text-gold-500">
              <Store size={13} aria-hidden />
              متجر إلكتروني
            </p>
            <h1 className="mt-2 text-[26px] font-bold leading-[1.2] text-white
                           sm:text-[34px] lg:text-[38px]">
              {name}
            </h1>
            {description && (
              <p className="mt-2.5 max-w-xl text-[14px] leading-relaxed text-white/70
                            sm:text-[15px]">
                {description}
              </p>
            )}
            {facts.length > 0 && (
              <p className="mt-3 text-[12px] font-medium tabular text-white/55">
                {facts.join(' · ')}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:mt-7">
          <Link href="/products"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-teal-500
                           px-5 text-[14px] font-semibold text-ink-900
                           transition-colors hover:bg-teal-400 sm:h-12 sm:px-6
                           sm:text-[15px]">
            تصفّح المنتجات
            <ArrowLeft size={17} className="flip-rtl" aria-hidden />
          </Link>
          {whatsapp && (
            <a href={`https://wa.me/${waNumber(whatsapp)}`}
               target="_blank" rel="noopener noreferrer"
               className="inline-flex h-11 items-center gap-2 rounded-md border
                          border-white/25 px-4 text-[14px] font-semibold text-white
                          transition-colors hover:bg-white/10 sm:h-12 sm:px-5
                          sm:text-[15px]">
              <MessageCircle size={16} aria-hidden />
              تواصل معنا
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
