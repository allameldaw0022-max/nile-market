'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Switch } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { formatMoney } from '@/lib/money/format';
import {
  deleteDeliveryZone, saveDeliveryZone, type DeliveryZone,
} from '@/lib/delivery/actions';

/**
 * مناطق التوصيل. الأجرة المحفوظة هنا هي التي يقرأها `create_order`
 * وقت الطلب — لا رسم يأتي من المتصفح (D10 · S2).
 */
export function DeliveryZonesManager({ storeId, zones, canManage }: {
  storeId: string; zones: DeliveryZone[]; canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<DeliveryZone | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, start] = useTransition();

  const close = () => { setEditing(null); setCreating(false); setError(null); };

  const submit = (formData: FormData) => start(async () => {
    setError(null);
    const numberOrNull = (key: string) => {
      const raw = String(formData.get(key) ?? '').trim();
      return raw === '' ? null : Number(raw);
    };

    const res = await saveDeliveryZone({
      storeId,
      zoneId: editing?.id ?? null,
      name: String(formData.get('name') ?? ''),
      fee: Number(formData.get('fee')),
      minOrderFree: numberOrNull('min_order_free'),
      estDaysMin: numberOrNull('est_days_min'),
      estDaysMax: numberOrNull('est_days_max'),
      isActive: formData.get('is_active') === 'on',
    });

    if (!res.ok) { setError({ message: res.message, field: res.field }); return; }
    close();
    router.refresh();
  });

  const remove = (zone: DeliveryZone) => start(async () => {
    setError(null);
    const res = await deleteDeliveryZone(storeId, zone.id);
    if (!res.ok) { setError({ message: res.message }); return; }
    router.refresh();
  });

  const form = creating || editing !== null;
  const current = editing;

  return (
    <div className="space-y-5">
      {error && !error.field && (
        <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error.message}
        </div>
      )}

      {canManage && !form && (
        <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
          منطقة توصيل جديدة
        </Button>
      )}

      {form && (
        <Card>
          <CardHeader title={current ? `تعديل ${current.name}` : 'منطقة توصيل جديدة'} />
          <form action={submit} className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="name" label="اسم المنطقة" required maxLength={80}
                     defaultValue={current?.name ?? ''} placeholder="مثال: الخرطوم"
                     error={error?.field === 'name' ? error.message : undefined} />
              <Input name="fee" label="أجرة التوصيل" required type="number" min={0}
                     step="0.01" inputMode="decimal" dir="ltr"
                     defaultValue={current?.fee ?? ''}
                     error={error?.field === 'fee' ? error.message : undefined} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input name="min_order_free" label="توصيل مجاني فوق" type="number" min={0}
                     step="0.01" inputMode="decimal" dir="ltr"
                     defaultValue={current?.minOrderFree ?? ''}
                     hint="اتركه فارغًا لتعطيله."
                     error={error?.field === 'min_order_free' ? error.message : undefined} />
              <Input name="est_days_min" label="أقل مدة (أيام)" type="number" min={0}
                     step="1" inputMode="numeric" dir="ltr"
                     defaultValue={current?.estDaysMin ?? ''} />
              <Input name="est_days_max" label="أقصى مدة (أيام)" type="number" min={0}
                     step="1" inputMode="numeric" dir="ltr"
                     defaultValue={current?.estDaysMax ?? ''} />
            </div>

            <Switch name="is_active" label="المنطقة مفعّلة"
                    hint="غير المفعّلة لا تظهر للزبون عند الطلب."
                    defaultChecked={current?.isActive ?? true} />

            <div className="flex gap-2">
              <Button type="submit" loading={pending}>
                {current ? 'حفظ التغييرات' : 'إضافة المنطقة'}
              </Button>
              <Button type="button" variant="ghost" onClick={close}>إلغاء</Button>
            </div>
          </form>
        </Card>
      )}

      {zones.length === 0 ? (
        <EmptyState
          icon={<Truck size={36} strokeWidth={1.5} />}
          title="لا مناطق توصيل"
          description="أضف منطقة واحدة على الأقل ليتمكن الزبائن من الطلب."
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-sand-200">
            {zones.map((z) => (
              <li key={z.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <span className="font-bold text-navy-900">{z.name}</span>
                <span className="font-bold tabular text-navy-900">{formatMoney(z.fee)}</span>

                <div className="min-w-0 flex-1 text-xs text-sand-600">
                  {z.minOrderFree != null && (
                    <span className="me-3">مجاني فوق {formatMoney(z.minOrderFree)}</span>
                  )}
                  {z.estDaysMin != null && (
                    <span className="tabular">
                      {z.estDaysMax != null && z.estDaysMax !== z.estDaysMin
                        ? `${z.estDaysMin}–${z.estDaysMax} يوم`
                        : `${z.estDaysMin} يوم`}
                    </span>
                  )}
                </div>

                <Badge tone={z.isActive ? 'success' : 'neutral'}>
                  {z.isActive ? 'مفعّلة' : 'موقوفة'}
                </Badge>

                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" disabled={pending}
                            onClick={() => setEditing(z)}>
                      تعديل
                    </Button>
                    <button type="button" aria-label={`حذف ${z.name}`} disabled={pending}
                            onClick={() => {
                              if (confirm(`حذف منطقة ${z.name}؟ الطلبات السابقة تبقى كما هي.`))
                                remove(z);
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
