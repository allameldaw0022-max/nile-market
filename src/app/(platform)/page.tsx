import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { buttonClass } from '@/components/ui/Button';
import {
  DashboardPreview, MobilePreview, OrdersPreview, ProductsPreview,
} from '@/components/marketing/ProductPreview';
import { PlanGrid } from '@/components/marketing/PlanGrid';
import { Faq } from '@/components/marketing/Faq';

export const revalidate = 300;

export const metadata: Metadata = {
  description:
    'سوق النيل منصة لإنشاء متجرك الإلكتروني وإدارة منتجاتك وطلباتك ومخزونك وعملائك من لوحة واحدة.',
};

/**
 * الصفحة الرئيسية — Product-first.
 *
 * ★ المنتج هو العنصر البصري لا الزخرفة: كل قسم يعرض شاشة حيّة مبنية
 * من نفس أساسيات لوحة التاجر (لا صور ولا Mockups)، ولكل قسم تخطيط
 * مختلف — عمودان متفاوتان، ثم شريط داكن، ثم قائمة خطوات مرقّمة، ثم
 * لوح تحليلات. تكرار «أيقونة + عنوان + وصف» في بطاقات متطابقة هو ما
 * يجعل الموقع يبدو مولَّدًا، فلا يتكرّر هنا قسم بتخطيط قسم آخر.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const { data: plans } = await supabase
    .from('plans')
    .select('id, code, name, description, price, is_free, price_configured_at')
    .eq('is_active', true).eq('is_public', true)
    .order('sort_order');

  return (
    <>
      {/* ───────────────── Hero: عمودان متفاوتان، المنتج هو البطل ──── */}
      <section className="border-b border-ink-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[minmax(0,42%)_minmax(0,1fr)]
                        lg:items-center lg:gap-12 lg:py-20">
          <div>
            <h1 className="text-ink-900">
              تجارتك تبدأ
              <span className="block text-teal-700">من هنا.</span>
            </h1>
            <p className="prose-width mt-5 text-[17px] leading-relaxed text-ink-500">
              أنشئ متجرك، أضف منتجاتك، واستقبل الطلبات وتابع المخزون والعملاء
              من لوحة واحدة — بالعربية، وبواجهة تعمل على الشبكات الضعيفة.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/signup" className={buttonClass('primary', 'lg')}>
                أنشئ متجرك مجانًا
                <ArrowLeft size={18} className="flip-rtl" aria-hidden />
              </Link>
              <Link href="#how" className={buttonClass('outline', 'lg')}>
                شاهد كيف يعمل
              </Link>
            </div>

            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-500">
              {['بلا رسوم إعداد', 'رابط متجر فوري', 'تحكّم كامل في منتجاتك'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check size={14} className="text-teal-600" aria-hidden />{t}
                </li>
              ))}
            </ul>
          </div>

          <DashboardPreview />
        </div>
      </section>

      {/* ───────────────── كيف يعمل: خطوات مرقّمة + شاشة المنتجات ──── */}
      <section id="how" className="border-b border-ink-200 bg-ink-50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2 lg:items-center lg:py-20">
          <div className="order-2 min-w-0 lg:order-1">
            <ProductsPreview />
          </div>

          <div className="order-1 min-w-0 lg:order-2">
            <h2>من المنتج إلى الطلب في ثلاث خطوات</h2>
            <p className="prose-width mt-3 text-ink-500">
              لا إعدادات معقّدة ولا انتظار. تنشئ المتجر وتضيف أول منتج
              وتشارك الرابط — في الجلسة نفسها.
            </p>

            <ol className="mt-8 space-y-6">
              {[
                { t: 'أنشئ متجرك', b: 'اسم المتجر ونوع النشاط، وتحصل على رابط خاص بك فورًا.' },
                { t: 'أضف منتجاتك', b: 'صور وأسعار ومتغيّرات ومخزون. أو استورد قائمتك دفعة واحدة من ملف.' },
                { t: 'شارك واستقبل الطلبات', b: 'رابط متجرك جاهز للنشر، والطلبات تصلك في اللوحة وعبر واتساب.' },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-4">
                  <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full
                                   border border-teal-600 text-[13px] font-bold tabular text-teal-700">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block font-semibold text-ink-900">{s.t}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-ink-500">{s.b}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ───────────────── الطلبات: شريط داكن، الشاشة بعرض كامل ───── */}
      <section className="border-b border-ink-200 bg-ink-800">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-white">تابع طلباتك لحظة بلحظة</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-white/70">
              كل طلب بحالته ومدينته وطريقة دفعه. تصفية بالحالة، وبحث برقم الطلب
              أو هاتف العميل، وتحديث الحالة بضغطة — مع سجلّ يوضّح من غيّر ماذا ومتى.
            </p>
          </div>
          <div className="mt-9">
            <OrdersPreview className="border-white/10" />
          </div>
        </div>
      </section>

      {/* ───────────────── الهاتف: نصّ + جهاز، بلا بطاقات ─────────── */}
      <section className="border-b border-ink-200 bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[1fr_auto] lg:py-20">
          <div>
            <h2>عميلك يشتري من هاتفه</h2>
            <p className="prose-width mt-3 text-ink-500">
              متجرك مبني للهاتف أولًا: صور خفيفة، وبحث سريع، وسلّة لا تضيع،
              وإتمام طلب من شاشة واحدة. لأن أغلب زبائنك لن يفتحوا حاسوبًا.
            </p>
            <dl className="mt-8 grid max-w-md grid-cols-2 gap-x-6 gap-y-5">
              {[
                ['يعمل بلا إنترنت', 'تصفّح ما سبق فتحه حتى بانقطاع الشبكة.'],
                ['يُثبَّت كتطبيق', 'أيقونة على شاشة الهاتف باسم متجرك أنت.'],
                ['دفع عند الاستلام', 'وتحويل بنكي وبنكك — تختار ما يناسبك.'],
                ['واتساب مدمج', 'العميل يسألك عن المنتج مباشرة من صفحته.'],
              ].map(([t, b]) => (
                <div key={t}>
                  <dt className="text-[14px] font-semibold text-ink-900">{t}</dt>
                  <dd className="mt-1 text-[13px] leading-relaxed text-ink-500">{b}</dd>
                </div>
              ))}
            </dl>
          </div>
          <MobilePreview />
        </div>
      </section>

      {/* ───────────────── الباقات ─────────────────────────────────── */}
      <section id="pricing" className="border-b border-ink-200 bg-ink-50">
        <div className="mx-auto max-w-5xl px-4 py-16 lg:py-20">
          <div className="max-w-2xl">
            <h2>الباقات</h2>
            <p className="mt-3 text-ink-500">
              ابدأ بالمجانية بلا بطاقة، وارقِ حين يكبر متجرك.
            </p>
          </div>
          <PlanGrid plans={plans ?? []} className="mt-9" />
          <p className="mt-6 text-[13px] text-ink-500">
            تريد المقارنة التفصيلية بين الباقات؟{' '}
            <Link href="/pricing" className="font-medium text-teal-700 underline underline-offset-4">
              صفحة الباقات
            </Link>
          </p>
        </div>
      </section>

      {/* ───────────────── الأسئلة الشائعة ─────────────────────────── */}
      <section id="faq" className="border-b border-ink-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 lg:py-20">
          <h2>أسئلة يسألها التجّار قبل البدء</h2>
          <Faq className="mt-8" />
        </div>
      </section>

      {/* ───────────────── نداء أخير: سطر واحد، لا بطاقة ───────────── */}
      <section className="bg-ink-800">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-4 py-14
                        sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-white">جاهز تبدأ؟</h2>
            <p className="mt-2 text-[15px] text-white/70">
              أنشئ متجرك الآن — الباقة المجانية تكفي لتبيع أول منتج اليوم.
            </p>
          </div>
          <Link href="/signup" className={buttonClass('primary', 'lg', 'shrink-0')}>
            أنشئ متجرك مجانًا
            <ArrowLeft size={18} className="flip-rtl" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
