import Link from 'next/link';
import type { Metadata } from 'next';
import { Check, Minus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatMoney, formatNumber } from '@/lib/money/format';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'الباقات والأسعار',
  description: 'باقات نايل ماركت وأسعارها وحدود كل باقة.',
};

const FEATURE_LABEL: Record<string, string> = {
  'products.max':          'عدد المنتجات',
  'orders.monthly_max':    'الطلبات شهريًا',
  'employees.max':         'عدد الموظفين',
  'storage.mb':            'مساحة التخزين (م.ب)',
  'coupons.max_active':    'أكواد خصم نشطة',
  'promotions.max_active': 'عروض نشطة',
  'custom_domain.enabled': 'دومين مخصص',
  'variants.enabled':      'خيارات المنتج',
  'import_export.enabled': 'استيراد وتصدير',
  'analytics.advanced':    'إحصاءات متقدمة',
  'whatsapp.enabled':      'زر واتساب',
};

const ORDER = Object.keys(FEATURE_LABEL);

type PlanRow = {
  id: string; code: string; name: string; description: string | null;
  price: number; duration_days: number | null; is_free: boolean;
  price_configured_at: string | null;
  plan_entitlements: {
    feature_key: string; limit_value: number | null; bool_value: boolean | null;
  }[] | null;
};

/**
 * صفحة الباقات.
 *
 * ★ الأسعار والحدود من القاعدة لا من ثوابت في الصفحة: سعرٌ مكتوب هنا
 * يخالف ما يُحاسَب به التاجر عند الاشتراك.
 *
 * ★ D18: باقة لم يُضبط سعرها لا يُعرض لها رقم ولا زرّ اشتراك — تُعلَن
 * «قريبًا». عرض «0 ج.س» لباقة غير مضبوطة وعدٌ بالمجانية.
 */
export default async function PricingPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('plans')
    .select('id, code, name, description, price, duration_days, is_free, price_configured_at, plan_entitlements(feature_key, limit_value, bool_value)')
    .eq('is_active', true).eq('is_public', true)
    .order('sort_order');

  const plans = (data ?? []) as unknown as PlanRow[];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold text-navy-900 sm:text-3xl">
          الباقات والأسعار
        </h1>
        <p className="mt-2 text-sm text-sand-600">
          ابدأ مجانًا، وارفع باقتك حين يكبر متجرك. الدفع يدوي بتحويل
          بنكي أو بنكك، ولا تُخصم أي مبالغ تلقائيًا.
        </p>
      </div>

      {plans.length === 0 ? (
        <Card className="mt-8 p-8 text-center text-sm text-sand-600">
          لم تُنشر الباقات بعد.
        </Card>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const configured = plan.is_free || plan.price_configured_at !== null;
            const ent = new Map(
              (plan.plan_entitlements ?? []).map((e) => [e.feature_key, e]));

            return (
              <Card key={plan.id} className="flex flex-col p-6">
                <h2 className="font-extrabold text-navy-900">{plan.name}</h2>
                {plan.description && (
                  <p className="mt-1 text-sm text-sand-600">{plan.description}</p>
                )}

                <p className="mt-4">
                  {!configured ? (
                    <Badge tone="warning">السعر يُعلن قريبًا</Badge>
                  ) : plan.is_free ? (
                    <span className="text-2xl font-extrabold text-navy-900">مجانية</span>
                  ) : (
                    <>
                      <span className="text-2xl font-extrabold tabular text-navy-900">
                        {formatMoney(plan.price)}
                      </span>
                      {plan.duration_days && (
                        <span className="text-sm text-sand-600">
                          {' '}/ {formatNumber(plan.duration_days)} يومًا
                        </span>
                      )}
                    </>
                  )}
                </p>

                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {ORDER.map((key) => {
                    const e = ent.get(key);
                    if (!e) return null;
                    const isBool = e.bool_value !== null;
                    const on = isBool ? e.bool_value : true;
                    return (
                      <li key={key} className="flex items-start gap-2">
                        {on ? (
                          <Check size={15} className="mt-0.5 shrink-0 text-[--color-success]" />
                        ) : (
                          <Minus size={15} className="mt-0.5 shrink-0 text-sand-400" />
                        )}
                        <span className={on ? 'text-navy-800' : 'text-sand-500'}>
                          {FEATURE_LABEL[key]}
                          {!isBool && (
                            <span className="font-bold tabular">
                              {': '}
                              {e.limit_value === null
                                ? 'بلا حد' : formatNumber(e.limit_value)}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-6">
                  {configured ? (
                    <Link href="/signup">
                      <Button className="w-full"
                              variant={plan.is_free ? 'outline' : 'primary'}>
                        ابدأ الآن
                      </Button>
                    </Link>
                  ) : (
                    <Button className="w-full" variant="outline" disabled>
                      غير متاحة بعد
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-sand-600">
        الأسعار بالجنيه السوداني. راجع{' '}
        <Link href="/legal/subscription" className="underline">سياسة الاشتراك</Link>{' '}
        و<Link href="/legal/cancellation" className="underline">سياسة الإلغاء</Link>.
      </p>
    </div>
  );
}
