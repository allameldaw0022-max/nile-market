import Link from 'next/link';
import type { Metadata } from 'next';
import { Check, Minus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { buttonClass } from '@/components/ui/Button';
import { PlanGrid, type PublicPlan } from '@/components/marketing/PlanGrid';
import { Faq } from '@/components/marketing/Faq';
import { formatNumber } from '@/lib/money/format';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'الباقات والأسعار',
  description: 'قارن باقات سوق النيل وحدود كل باقة، واختر ما يناسب متجرك.',
};

/** ما تحكمه كل ميزة — مرتّبة بما يهمّ التاجر أولًا لا بترتيب المفتاح. */
const FEATURES: { key: string; label: string; hint?: string }[] = [
  { key: 'products.max',          label: 'عدد المنتجات' },
  { key: 'orders.monthly_max',    label: 'الطلبات شهريًا' },
  { key: 'employees.max',         label: 'أعضاء الفريق', hint: 'بأدوار وصلاحيات منفصلة' },
  { key: 'storage.mb',            label: 'مساحة الصور', hint: 'بالميجابايت' },
  { key: 'variants.enabled',      label: 'خيارات المنتج', hint: 'مقاسات وألوان بأسعار مختلفة' },
  { key: 'custom_domain.enabled', label: 'دومين مخصّص' },
  { key: 'coupons.max_active',    label: 'أكواد خصم نشطة' },
  { key: 'promotions.max_active', label: 'عروض نشطة' },
  { key: 'import_export.enabled', label: 'استيراد وتصدير المنتجات' },
  { key: 'analytics.advanced',    label: 'إحصاءات متقدّمة' },
  { key: 'whatsapp.enabled',      label: 'زرّ واتساب في المتجر' },
];

type Entitlement = { feature_key: string; limit_value: number | null; bool_value: boolean | null; configured_at: string | null };
type PlanRow = PublicPlan & { duration_days: number | null; plan_entitlements: Entitlement[] | null };

/**
 * صفحة الباقات — مقارنة لا ثلاث بطاقات متطابقة.
 *
 * ★ الأسعار والحدود من القاعدة وحدها: رقم مكتوب في الصفحة يخالف ما
 * يُحاسَب به التاجر فعلًا عند الاشتراك.
 *
 * ★ لا يُخترع حدّ ولا تُكتب «قريبًا»: خانة لم تُضبط بعد تُعرض «—»
 * وتحتها سطر واحد يقول صراحةً إن ما لم يُضبط لم يُعلن. وباقة بلا سعر
 * لا زرّ اشتراك لها (D18) بل «تواصل معنا» الذي يفتح تذكرة فعلية.
 */
export default async function PricingPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('plans')
    .select('id, code, name, description, price, duration_days, is_free, price_configured_at, plan_entitlements(feature_key, limit_value, bool_value, configured_at)')
    .eq('is_active', true).eq('is_public', true)
    .order('sort_order');

  const plans = (data ?? []) as unknown as PlanRow[];
  const anyUnconfigured = plans.some((p) =>
    FEATURES.some((f) => {
      const e = p.plan_entitlements?.find((x) => x.feature_key === f.key);
      return !e || e.configured_at === null;
    }));

  return (
    <>
      <section className="border-b border-ink-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-12 lg:py-16">
          <h1>الباقات والأسعار</h1>
          <p className="prose-width mt-4 text-[17px] leading-relaxed text-ink-500">
            ابدأ بالمجانية بلا بطاقة. الدفع يدوي بتحويل بنكي أو بنكك —
            ولا يُخصم منك أي مبلغ تلقائيًا في أي وقت.
          </p>
          <PlanGrid plans={plans} className="mt-9" />
        </div>
      </section>

      {plans.length > 0 && (
        <section className="border-b border-ink-200 bg-ink-50">
          <div className="mx-auto max-w-5xl px-4 py-12 lg:py-16">
            <h2>المقارنة التفصيلية</h2>
            <p className="mt-3 text-ink-500">ما تحصل عليه في كل باقة، صفًّا بصف.</p>

            <div role="region" aria-label="مقارنة الباقات" tabIndex={0}
                 className="mt-7 overflow-x-auto rounded-[--radius-lg] border border-ink-200 bg-white
                            focus-visible:outline-2 focus-visible:outline-teal-600">
              <table className="w-full min-w-[32rem] border-collapse text-sm">
                <caption className="sr-only">مقارنة حدود وميزات الباقات</caption>
                <thead>
                  <tr>
                    <th scope="col"
                        className="sticky start-0 z-10 border-b border-ink-200 bg-ink-50 px-4 py-3
                                   text-start text-[12px] font-semibold uppercase tracking-wide text-ink-500">
                      الميزة
                    </th>
                    {plans.map((p) => (
                      <th key={p.id} scope="col"
                          className="border-b border-ink-200 bg-ink-50 px-4 py-3 text-center
                                     text-[13px] font-bold text-ink-900">
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map((f) => (
                    <tr key={f.key} className="hover:bg-ink-50">
                      <th scope="row"
                          className="sticky start-0 z-10 border-b border-ink-100 bg-white px-4 py-3 text-start font-normal">
                        <span className="block font-medium text-ink-900">{f.label}</span>
                        {f.hint && <span className="mt-0.5 block text-[12px] text-ink-500">{f.hint}</span>}
                      </th>
                      {plans.map((p) => (
                        <td key={p.id} className="border-b border-ink-100 px-4 py-3 text-center">
                          <Cell e={p.plan_entitlements?.find((x) => x.feature_key === f.key)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {anyUnconfigured && (
              <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
                الخانات المعلَّمة «—» لم تُضبط حدودها بعد، ولا نعرضها بأرقام
                تقديرية. تظهر هنا فور اعتمادها.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="border-b border-ink-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-12 lg:py-16">
          <h2>أسئلة عن الاشتراك</h2>
          <Faq className="mt-7" />
          <p className="mt-8 text-[13px] text-ink-500">
            راجع <Link href="/legal/subscription" className="font-medium text-teal-700 underline underline-offset-4">سياسة الاشتراك</Link>
            {' '}و<Link href="/legal/cancellation" className="font-medium text-teal-700 underline underline-offset-4">سياسة الإلغاء</Link>.
            الأسعار بالجنيه السوداني.
          </p>
        </div>
      </section>

      <section className="bg-ink-800">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-4 py-12
                        sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[17px] font-semibold text-white">
            ابدأ بالباقة المجانية اليوم — بلا بطاقة ولا التزام.
          </p>
          <Link href="/signup" className={buttonClass('primary', 'lg', 'shrink-0')}>
            أنشئ متجرك
          </Link>
        </div>
      </section>
    </>
  );
}

/**
 * خانة مقارنة. التمييز ليس باللون وحده: «✓» و«—» شكلان مختلفان،
 * ولكلٍّ نصّ بديل لقارئ الشاشة لأن الأيقونة وحدها لا تُقرأ.
 */
function Cell({ e }: { e?: Entitlement }) {
  if (!e || e.configured_at === null) {
    return <span className="text-ink-400" title="لم يُضبط بعد"><span aria-hidden>—</span>
      <span className="sr-only">لم يُضبط بعد</span></span>;
  }
  if (e.bool_value !== null) {
    return e.bool_value
      ? <><Check size={17} className="mx-auto text-teal-700" aria-hidden /><span className="sr-only">متاحة</span></>
      : <><Minus size={17} className="mx-auto text-ink-300" aria-hidden /><span className="sr-only">غير متاحة</span></>;
  }
  return (
    <span className="font-semibold tabular text-ink-900">
      {e.limit_value === null ? 'بلا حدّ' : formatNumber(e.limit_value)}
    </span>
  );
}
