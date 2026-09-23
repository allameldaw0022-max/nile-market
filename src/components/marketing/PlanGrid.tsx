import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buttonClass } from '@/components/ui/Button';
import { formatMoney } from '@/lib/money/format';

export type PublicPlan = {
  id: string; code: string; name: string; description: string | null;
  price: number | string | null; is_free: boolean | null;
  price_configured_at: string | null;
};

/**
 * بطاقات الباقات — من بيانات القاعدة وحدها.
 *
 * ★ لا يُخترع سعر ولا تُكتب كلمة «قريبًا». باقة لم يُضبط سعرها بعد
 * تُعرض بحدودها الحقيقية ونداء «تواصل معنا للسعر» الذي يفتح تذكرة
 * دعم فعلية — وهو صادق ولا يكسر D18 (باقة بلا سعر لا تُباع). عرضها
 * بسعر مخترع كذب، وإخفاؤها يخفي ما هو موجود فعلًا في النظام.
 */
export function PlanGrid({ plans, className }: { plans: PublicPlan[]; className?: string }) {
  if (plans.length === 0) {
    return (
      <p className={cn('rounded-lg border border-dashed border-ink-300 bg-white p-6 text-sm text-ink-500', className)}>
        لا توجد باقات معروضة حاليًا.
      </p>
    );
  }

  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {plans.map((p) => {
        const priced = Boolean(p.price_configured_at);
        const free = Boolean(p.is_free);
        const featured = p.code === 'basic';

        return (
          <div key={p.id} className={cn(
            'flex flex-col rounded-lg border bg-white p-5',
            featured ? 'border-teal-600' : 'border-ink-200',
          )}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[17px] font-bold text-ink-900">{p.name}</h3>
              {featured && (
                <span className="rounded-xs bg-teal-50 px-2 py-0.5
                                 text-[11px] font-semibold text-teal-700">
                  الأكثر ملاءمة
                </span>
              )}
            </div>

            <p className="mt-4 flex items-baseline gap-1.5">
              {free ? (
                <span className="text-[28px] font-bold leading-none text-ink-900">مجانًا</span>
              ) : priced ? (
                <>
                  <span className="text-[28px] font-bold leading-none tabular text-ink-900">
                    {formatMoney(p.price)}
                  </span>
                  <span className="text-[13px] font-medium text-ink-500">/ شهريًا</span>
                </>
              ) : (
                <span className="text-[17px] font-semibold text-ink-700">تواصل معنا للسعر</span>
              )}
            </p>

            {p.description && (
              <p className="mt-3 min-h-10 text-[13px] leading-relaxed text-ink-500">{p.description}</p>
            )}

            <div className="mt-auto pt-6">
              {free || priced ? (
                <Link href="/signup" className={buttonClass(featured ? 'primary' : 'outline', 'md', 'w-full')}>
                  ابدأ بـ{p.name}
                </Link>
              ) : (
                <Link href="/support/new" className={buttonClass('outline', 'md', 'w-full')}>
                  تواصل معنا
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** سطر ميزة — يُستعمل في جدول المقارنة وصفحة الباقات. */
export function FeatureLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-[13px] text-ink-700">
      <Check size={15} className="mt-0.5 shrink-0 text-teal-600" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
