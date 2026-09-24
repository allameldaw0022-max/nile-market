import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, MessageCircle, Store } from 'lucide-react';
import { waNumber } from '@/lib/phone';

/**
 * هوية المتجر — القالب المشترك لكل المتاجر.
 *
 * ★ الافتتاحية تُعرّف المتجر ثم تُفسح للمنتجات — وهي البضاعة لا
 * الديكور. كانت تأكل شاشة الهاتف كاملة (حشوة ٤٠px، وشعار في سطر،
 * والاسم في سطر تحته)، فلا يرى الزائر منتجًا واحدًا قبل التمرير.
 * الآن صفّ واحد على كل المقاسات وحشوة ٢٤–٤٠px، فتبدأ المنتجات فوق
 * الطيّة.
 *
 * ★ ثلاث حالات لا واحدة، وكلّها من بيانات التاجر الحقيقية:
 *   غلاف + شعار → الصورة خلفية بطبقة متدرّجة والهوية فوقها.
 *   شعار بلا غلاف → تكوين طباعي على خلفية داكنة.
 *   لا شيء       → الحرف الأول من اسم المتجر في مربّع — أقلّ ما يميّز
 *                  متجرًا عن صفحة، وليس صورة مخترعة.
 *
 * ★ ولا لون مكتوب هنا خارج نظام التصميم: القالب واحد لكل المتاجر،
 * والتمييز يأتي من الشعار والغلاف والاسم لا من فرع في الكود.
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
    <section className="relative isolate overflow-hidden border-b border-ink-200
                        bg-ink-900">
      {bannerUrl && (
        <>
          {/* ★ `priority` لأنها أكبر عنصر فوق الطيّة (LCP)، و`sizes`
              بعرض الشاشة كاملًا لأنها تمتدّ من حافة إلى حافة. */}
          <Image src={bannerUrl} alt="" fill priority sizes="100vw"
                 className="object-cover object-center" />
          {/* ★ طبقتان لا واحدة، ومقدارهما محسوب لا مبالَغ فيه:
              الأولى أرضية تعتيم ٣٠٪ تضمن تباينًا مقبولًا على أي
              غلاف فاتح، والثانية تُثقل جهة البداية (يمين الصفحة
              العربية) حيث يقف الاسم والأزرار وتكاد تختفي عند الطرف
              الآخر. بتعتيم أثقل من هذا يختفي غلاف التاجر الذي رفعه،
              وبأخفّ منه يسقط تباين النصّ الأبيض. */}
          <div aria-hidden className="absolute inset-0 bg-ink-900/30" />
          <div aria-hidden
               className="absolute inset-0 bg-gradient-to-l from-ink-900/85
                          via-ink-900/45 to-ink-900/5" />
        </>
      )}

      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:py-9 lg:py-10">
        {/* ★ صفّ واحد على الهاتف أيضًا: التكديس العمودي كان يضيف
            ~١٢٠px بلا معلومة إضافية. */}
        <div className="flex items-center gap-3.5 sm:gap-5">
          <div className="shrink-0">
            {logoUrl ? (
              <Image src={logoUrl} alt="" width={96} height={96}
                     className="size-14 rounded-xl object-cover
                                ring-1 ring-white/25 sm:size-[72px]" />
            ) : (
              <span aria-hidden
                    className="grid size-14 place-items-center rounded-xl
                               bg-white/10 text-[22px] font-bold text-white
                               ring-1 ring-white/25 sm:size-[72px] sm:text-[28px]">
                {initial}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold
                          text-gold-500 sm:text-[12px]">
              <Store size={12} aria-hidden />
              متجر إلكتروني
            </p>
            <h1 className="mt-1 truncate text-[19px] font-bold leading-tight
                           text-white sm:text-[26px] lg:text-[30px]">
              {name}
            </h1>
            {facts.length > 0 && (
              <p className="mt-1 text-[11px] font-medium tabular text-white/55
                            sm:text-[12px]">
                {facts.join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* ★ الوصف تحت الصفّ لا داخله: بجانب الاسم كان يزاحمه على
            الهاتف. وسطران كحدّ أقصى — الوصف الطويل مكانه صفحة «من
            نحن» لا الافتتاحية. */}
        {description && (
          <p className="mt-3 line-clamp-2 max-w-2xl text-[13px] leading-relaxed
                        text-white/70 sm:text-[14px]">
            {description}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-5 sm:gap-2.5">
          <Link href="/products"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-500
                           px-4 text-[13px] font-semibold text-ink-900
                           transition-colors hover:bg-teal-400 sm:h-11 sm:px-5
                           sm:text-[14px]">
            تصفّح المنتجات
            <ArrowLeft size={16} className="flip-rtl" aria-hidden />
          </Link>
          {whatsapp && (
            <a href={`https://wa.me/${waNumber(whatsapp)}`}
               target="_blank" rel="noopener noreferrer"
               className="inline-flex h-10 items-center gap-2 rounded-md border
                          border-white/25 bg-white/5 px-3.5 text-[13px]
                          font-semibold text-white backdrop-blur-sm
                          transition-colors hover:bg-white/15 sm:h-11 sm:px-4
                          sm:text-[14px]">
              <MessageCircle size={15} aria-hidden />
              تواصل معنا
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
