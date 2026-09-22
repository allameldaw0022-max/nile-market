'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { setPlanEntitlement, setPlanPrice } from '@/lib/admin/actions';

export type EntitlementRow = {
  featureKey: string; label: string; kind: 'limit' | 'bool';
  limitValue: number | null; boolValue: boolean | null; configured: boolean;
};

export type PlanRow = {
  id: string; code: string; name: string; price: number;
  durationDays: number; isFree: boolean; priceConfigured: boolean;
  entitlements: EntitlementRow[];
};

/**
 * ضبط الباقات (D18).
 *
 * ★ لا قيمة افتراضية مخترَعة: الحقل الفارغ يعني «لم يُضبط»، والنظام
 * لا يفرض حدًّا لم يضبطه المالك. الختم (`configured_at`) يكتبه trigger
 * في القاعدة عند أول ضبط، فلا تستطيع الواجهة ادّعاءه.
 */
export function PlanEditor({ plans, canEdit }: {
  plans: PlanRow[]; canEdit: boolean;
}) {
  return (
    <div className="space-y-5">
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} canEdit={canEdit} />
      ))}
    </div>
  );
}

function PlanCard({ plan, canEdit }: { plan: PlanRow; canEdit: boolean }) {
  const router = useRouter();
  const [price, setPrice] = useState(String(plan.price));
  const [days, setDays] = useState(String(plan.durationDays));
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const savePrice = () => start(async () => {
    setError(null);
    setSaved(null);
    const res = await setPlanPrice({
      planId: plan.id, price: Number(price), durationDays: Number(days),
    });
    if (!res.ok) { setError(res.message); return; }
    setSaved('price');
    router.refresh();
  });

  const saveEntitlement = (row: EntitlementRow, value: string | boolean) =>
    start(async () => {
      setError(null);
      setSaved(null);
      const res = await setPlanEntitlement({
        planId: plan.id,
        featureKey: row.featureKey,
        limitValue: row.kind === 'limit'
          ? (String(value).trim() === '' ? null : Number(value))
          : undefined,
        boolValue: row.kind === 'bool' ? Boolean(value) : undefined,
      });
      if (!res.ok) { setError(res.message); return; }
      setSaved(row.featureKey);
      router.refresh();
    });

  return (
    <Card>
      <CardHeader
        title={plan.name}
        description={plan.isFree ? 'باقة مجانية دائمة.' : undefined}
        action={plan.isFree ? <Badge tone="neutral">مجانية</Badge>
          : plan.priceConfigured
            ? <Badge tone="success">السعر مضبوط</Badge>
            : <Badge tone="warning">السعر غير مضبوط</Badge>}
      />

      <div className="space-y-4 p-5">
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                          border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                          text-sm text-[--color-danger]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}
          </p>
        )}

        {!plan.isFree && (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Input label="السعر (ج.س)" value={price} type="number" min={0} step="0.01"
                   inputMode="decimal" dir="ltr" disabled={!canEdit}
                   onChange={(e) => setPrice(e.target.value)} />
            <Input label="المدة (أيام)" value={days} type="number" min={1} step="1"
                   inputMode="numeric" dir="ltr" disabled={!canEdit}
                   onChange={(e) => setDays(e.target.value)} />
            {canEdit && (
              <Button size="sm" loading={pending} onClick={savePrice}
                      className="mb-1.5">
                {saved === 'price' ? <><Check size={14} /> حُفظ</> : 'حفظ السعر'}
              </Button>
            )}
          </div>
        )}

        <div className="space-y-2 border-t border-sand-200 pt-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-navy-900">
            الحدود والميزات
          </p>
          <p className="flex items-start gap-1.5 text-xs text-sand-600">
            <Info size={12} className="mt-0.5 shrink-0" />
            الحقل الفارغ = لم يُضبط، ولا يفرض النظام حدًّا لم تضبطه. لإلغاء الحد
            صراحةً اترك الرقم فارغًا واحفظ.
          </p>

          <ul className="divide-y divide-sand-200">
            {plan.entitlements.map((row) => (
              <li key={row.featureKey}
                  className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-sm text-navy-900">
                  {row.label}
                  {!row.configured && (
                    <span className="ms-2 text-xs text-gold-700">غير مضبوط</span>
                  )}
                </span>

                {row.kind === 'bool' ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" defaultChecked={row.boolValue ?? false}
                           disabled={!canEdit || pending}
                           className="size-4 accent-[--color-nile-500]"
                           onChange={(e) => saveEntitlement(row, e.target.checked)} />
                    متاحة
                  </label>
                ) : (
                  <input type="number" min={0} step="1" dir="ltr" inputMode="numeric"
                         defaultValue={row.limitValue ?? ''}
                         disabled={!canEdit || pending}
                         aria-label={row.label}
                         placeholder="بلا حد"
                         onBlur={(e) => {
                           const next = e.target.value;
                           const before = row.limitValue === null ? '' : String(row.limitValue);
                           if (next !== before) saveEntitlement(row, next);
                         }}
                         className="h-9 w-28 rounded-[--radius-md] border border-sand-300
                                    bg-white px-2 text-sm tabular text-navy-900
                                    focus:border-nile-500 disabled:bg-sand-100" />
                )}

                {saved === row.featureKey && (
                  <Check size={14} className="text-[--color-success]" />
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
