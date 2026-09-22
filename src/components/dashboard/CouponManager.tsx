'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Percent, Plus, Tag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Select, Switch } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, UpgradeCard } from '@/components/ui/States';
import { formatDate, formatMoney } from '@/lib/money/format';
import { deleteCoupon, saveCoupon, setCouponActive } from '@/lib/coupons/actions';

export type CouponRow = {
  id: string; code: string; type: 'percentage' | 'fixed'; value: number;
  minOrderAmount: number | null; maxDiscountAmount: number | null;
  startsAt: string | null; endsAt: string | null;
  usageLimitTotal: number | null; usageLimitPerCustomer: number | null;
  usedCount: number; isActive: boolean;
};

export function CouponManager({ storeId, coupons, canManage }: {
  storeId: string; coupons: CouponRow[]; canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => { setEditing(null); setCreating(false); setError(null); };

  const submit = (formData: FormData) => start(async () => {
    setError(null);
    setLimit(null);
    const type = String(formData.get('type')) as 'percentage' | 'fixed';
    const numberOrNull = (key: string) => {
      const raw = String(formData.get(key) ?? '').trim();
      return raw === '' ? null : Number(raw);
    };

    const res = await saveCoupon({
      storeId,
      couponId: editing?.id ?? null,
      code: String(formData.get('code') ?? ''),
      type,
      value: Number(formData.get('value')),
      minOrderAmount: numberOrNull('min_order_amount'),
      maxDiscountAmount: numberOrNull('max_discount_amount'),
      startsAt: String(formData.get('starts_at') ?? '') || null,
      endsAt: String(formData.get('ends_at') ?? '') || null,
      usageLimitTotal: numberOrNull('usage_limit_total'),
      usageLimitPerCustomer: numberOrNull('usage_limit_per_customer'),
      isActive: formData.get('is_active') === 'on',
    });

    if (!res.ok) {
      if (res.code === 'LIMIT_EXCEEDED') setLimit(res.message);
      else setError({ message: res.message, field: res.field });
      return;
    }
    close();
    router.refresh();
  });

  const toggle = (coupon: CouponRow) => start(async () => {
    setError(null);
    const res = await setCouponActive(storeId, coupon.id, !coupon.isActive);
    if (!res.ok) { setError({ message: res.message }); return; }
    router.refresh();
  });

  const remove = (coupon: CouponRow) => start(async () => {
    setError(null);
    const res = await deleteCoupon(storeId, coupon.id);
    if (!res.ok) { setError({ message: res.message }); return; }
    router.refresh();
  });

  const form = creating || editing !== null;
  const current = editing;

  return (
    <div className="space-y-5">
      {limit && <UpgradeCard message={limit} />}

      {error && !error.field && (
        <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error.message}
        </div>
      )}

      {canManage && !form && (
        <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
          كود خصم جديد
        </Button>
      )}

      {form && (
        <Card>
          <CardHeader title={current ? `تعديل ${current.code}` : 'كود خصم جديد'} />
          <form action={submit} className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="code" label="الكود" required dir="ltr" maxLength={32}
                     defaultValue={current?.code ?? ''}
                     hint="حروف لاتينية وأرقام — مثال: EID2026"
                     error={error?.field === 'code' ? error.message : undefined} />
              <Select name="type" label="نوع الخصم" required
                      defaultValue={current?.type ?? 'fixed'}>
                <option value="fixed">مبلغ ثابت</option>
                <option value="percentage">نسبة مئوية</option>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="value" label="قيمة الخصم" required type="number" min={0.01}
                     step="0.01" inputMode="decimal" dir="ltr"
                     defaultValue={current?.value ?? ''}
                     hint="مبلغ بالجنيه أو نسبة من 1 إلى 100"
                     error={error?.field === 'value' ? error.message : undefined} />
              <Input name="max_discount_amount" label="سقف الخصم (للنسبة فقط)"
                     type="number" min={0.01} step="0.01" inputMode="decimal" dir="ltr"
                     defaultValue={current?.maxDiscountAmount ?? ''} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input name="min_order_amount" label="أقل قيمة طلب" type="number" min={0}
                     step="0.01" inputMode="decimal" dir="ltr"
                     defaultValue={current?.minOrderAmount ?? ''} />
              <Input name="usage_limit_total" label="حد الاستخدام الكلي" type="number"
                     min={1} step="1" inputMode="numeric" dir="ltr"
                     defaultValue={current?.usageLimitTotal ?? ''} />
              <Input name="usage_limit_per_customer" label="حد الاستخدام لكل زبون"
                     type="number" min={1} step="1" inputMode="numeric" dir="ltr"
                     defaultValue={current?.usageLimitPerCustomer ?? ''} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="starts_at" label="يبدأ في" type="datetime-local" dir="ltr"
                     defaultValue={toLocalInput(current?.startsAt)} />
              <Input name="ends_at" label="ينتهي في" type="datetime-local" dir="ltr"
                     defaultValue={toLocalInput(current?.endsAt)}
                     error={error?.field === 'endsAt' ? error.message : undefined} />
            </div>

            <Switch name="is_active" label="الكود مفعّل"
                    hint="غير المفعّل لا يقبله النظام وقت الطلب."
                    defaultChecked={current?.isActive ?? true} />

            <div className="flex gap-2">
              <Button type="submit" loading={pending}>
                {current ? 'حفظ التغييرات' : 'إنشاء الكود'}
              </Button>
              <Button type="button" variant="ghost" onClick={close}>إلغاء</Button>
            </div>
          </form>
        </Card>
      )}

      {coupons.length === 0 ? (
        <EmptyState
          icon={<Tag size={36} strokeWidth={1.5} />}
          title="لا أكواد خصم بعد"
          description="أنشئ كودًا ليستخدمه زبائنك عند إتمام الطلب."
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-ink-200">
            {coupons.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <span className="inline-flex items-center gap-1.5 font-extrabold
                                 tabular text-ink-900" dir="ltr">
                  {c.type === 'percentage' ? <Percent size={14} /> : <Tag size={14} />}
                  {c.code}
                </span>

                <span className="font-bold tabular text-ink-900">
                  {c.type === 'percentage' ? `${c.value}%` : formatMoney(c.value)}
                </span>

                <div className="min-w-0 flex-1 text-xs text-ink-500">
                  {c.minOrderAmount != null && (
                    <span className="me-3">أقل طلب {formatMoney(c.minOrderAmount)}</span>
                  )}
                  {c.endsAt && <span className="me-3">ينتهي {formatDate(c.endsAt)}</span>}
                  <span className="tabular">
                    استُخدم {c.usedCount}
                    {c.usageLimitTotal != null && ` من ${c.usageLimitTotal}`}
                  </span>
                </div>

                <Badge tone={c.isActive ? 'success' : 'neutral'}>
                  {c.isActive ? 'مفعّل' : 'موقوف'}
                </Badge>

                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" disabled={pending}
                            onClick={() => setEditing(c)}>
                      تعديل
                    </Button>
                    <Button variant="ghost" size="sm" disabled={pending}
                            onClick={() => toggle(c)}>
                      {c.isActive ? 'إيقاف' : 'تفعيل'}
                    </Button>
                    <button type="button" aria-label={`حذف ${c.code}`} disabled={pending}
                            onClick={() => {
                              if (confirm(`حذف الكود ${c.code}؟ الطلبات التي استخدمته تبقى كما هي.`))
                                remove(c);
                            }}
                            className="rounded p-2 text-[--color-danger]
                                       hover:bg-[--color-danger-bg] disabled:opacity-50">
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** ISO ⇒ صيغة datetime-local (بلا منطقة زمنية). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
