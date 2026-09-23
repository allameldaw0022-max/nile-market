import Link from 'next/link';
import { MessageCircle, Phone, LifeBuoy } from 'lucide-react';

/**
 * شريط التواصل — آخر ما قبل التذييل.
 *
 * ★ وظيفته بصرية ووظيفية معًا: يغلق الصفحة بنداء واضح، ويملأ
 * المسافة التي كانت تُترك بيضاء بين آخر منتج والتذييل حين يكون
 * المتجر قليل المحتوى.
 *
 * ★ لا يُعرض ما لا يملكه التاجر: بلا رقم واتساب ولا هاتف يبقى رابط
 * صفحة التواصل وحده — وهي موجودة في كل متجر.
 */
export function StoreContact({ storeName, whatsapp, phone }: {
  storeName: string; whatsapp: string | null; phone: string | null;
}) {
  return (
    <section className="border-t border-ink-200 bg-ink-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10
                      sm:flex-row sm:items-center sm:justify-between sm:py-12">
        <div className="min-w-0">
          <h2 className="text-[19px] font-bold text-white sm:text-[21px]">
            عندك سؤال قبل الطلب؟
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">
            راسل {storeName} مباشرةً — الردّ من المتجر نفسه لا من وسيط.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {whatsapp && (
            <a href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
               target="_blank" rel="noopener noreferrer"
               className="inline-flex h-11 items-center gap-2 rounded-md bg-[#25D366]
                          px-4 text-[14px] font-semibold text-white
                          transition-opacity hover:opacity-90">
              <MessageCircle size={16} aria-hidden />
              واتساب
            </a>
          )}
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}
               className="inline-flex h-11 items-center gap-2 rounded-md border
                          border-white/25 px-4 text-[14px] font-semibold text-white
                          transition-colors hover:bg-white/10">
              <Phone size={16} aria-hidden />
              <span dir="ltr" className="tabular">{phone}</span>
            </a>
          )}
          <Link href="/contact"
                className="inline-flex h-11 items-center gap-2 rounded-md border
                           border-white/25 px-4 text-[14px] font-semibold text-white
                           transition-colors hover:bg-white/10">
            <LifeBuoy size={16} aria-hidden />
            صفحة التواصل
          </Link>
        </div>
      </div>
    </section>
  );
}
