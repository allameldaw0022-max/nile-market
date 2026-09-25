import Link from 'next/link';
import Image from 'next/image';
import { MessageCircle, Phone, LifeBuoy } from 'lucide-react';
import { waNumber } from '@/lib/phone';

/**
 * شريط التواصل — آخر ما قبل التذييل.
 *
 * ★ وظيفته بصرية ووظيفية معًا: يغلق الصفحة بنداء واضح، ويملأ
 * المسافة التي كانت تُترك بيضاء بين آخر منتج والتذييل حين يكون
 * المتجر قليل المحتوى.
 *
 * ★ لا يُعرض ما لا يملكه التاجر: بلا رقم واتساب ولا هاتف يبقى رابط
 * صفحة التواصل وحده — وهي موجودة في كل متجر.
 *
 * ★★ الغلاف هنا هو **نفسه** غلاف الافتتاحية: حقل واحد
 * (`stores.banner_url`) ورفعٌ واحد من الإعدادات، يظهر في المكانين.
 * لا حقل ثانٍ ولا رافع ثانٍ — فتغييرٌ واحد من التاجر يحدّث الصفحة
 * من طرفيها، ولا يمكن أن يفترق أعلى المتجر عن أسفله.
 *
 * ★ وبلا غلاف يبقى الشريط الداكن كما كان — لا فراغ ولا صورة
 * مخترَعة.
 */
export function StoreContact({ storeName, whatsapp, phone, coverUrl }: {
  storeName: string; whatsapp: string | null; phone: string | null;
  /** غلاف المتجر نفسه — يُمرَّر من القشرة المشتركة. */
  coverUrl?: string | null;
}) {
  return (
    <section className="relative isolate overflow-hidden border-t border-ink-200
                        bg-ink-900">
      {coverUrl && (
        <>
          {/* ★ `loading="lazy"` هنا خلافًا للافتتاحية: هذا القسم
              أسفل الصفحة ولا يُرى إلا بعد تمرير طويل، فتحميله
              مبكّرًا يزاحم صور المنتجات على شبكة ضعيفة. */}
          <Image src={coverUrl} alt="" fill sizes="100vw" loading="lazy"
                 className="object-cover object-center" />
          {/* ★ التعتيم هنا **متّسق** لا متدرّج من جهة كما في
              الافتتاحية: هناك النصّ يقف على جهة واحدة فيُثقَّل
              جانبها ويُترك الآخر مكشوفًا، وهنا العنوان على طرف
              والأزرار على الطرف المقابل — فأيّ تدرّج أفقي يُعتم
              طرفًا ويترك الآخر غير مقروء.

              ★ و٥٥٪ ليست رقمًا مُختارًا بالذوق: النصّ الأبيض فوق
              غلاف متوسّط الإضاءة يعطي ٤٫٦:١ عند هذا الحدّ، أي فوق
              عتبة WCAG AA بقليل. وما دونه يسقط دونها على غلاف
              فاتح. التدرّج الرأسي الخفيف فوقه للعمق لا للقراءة. */}
          <div aria-hidden className="absolute inset-0 bg-ink-900/55" />
          <div aria-hidden
               className="absolute inset-0 bg-gradient-to-t from-ink-900/45
                          to-transparent" />
        </>
      )}

      <div className="relative mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10
                      sm:flex-row sm:items-center sm:justify-between sm:py-12">
        <div className="min-w-0">
          <h2 className="text-[19px] font-bold text-white sm:text-[21px]">
            عندك سؤال قبل الطلب؟
          </h2>
          <p className="mt-1.5 break-words text-[13px] leading-relaxed
                        text-white/70">
            راسل {storeName} مباشرةً — الردّ من المتجر نفسه لا من وسيط.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {whatsapp && (
            <a href={`https://wa.me/${waNumber(whatsapp)}`}
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
                          border-white/25 bg-white/5 px-4 text-[14px] font-semibold
                          text-white backdrop-blur-sm transition-colors
                          hover:bg-white/15">
              <Phone size={16} aria-hidden />
              <span dir="ltr" className="tabular">{phone}</span>
            </a>
          )}
          <Link href="/contact"
                className="inline-flex h-11 items-center gap-2 rounded-md border
                           border-white/25 bg-white/5 px-4 text-[14px] font-semibold
                           text-white backdrop-blur-sm transition-colors
                           hover:bg-white/15">
            <LifeBuoy size={16} aria-hidden />
            صفحة التواصل
          </Link>
        </div>
      </div>
    </section>
  );
}
