'use client';
import { useEffect, useState, useTransition } from 'react';
import { AlertTriangle, ChevronLeft, Plus, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { formatMoney } from '@/lib/money/format';
import {
  deleteDeliveryZone, listDeliveryZones, saveDeliveryZone, type DeliveryZone,
} from '@/lib/delivery/actions';

/** مدن مقترحة — مجرد اختصار للكتابة، والتاجر حر في أي اسم. */
const SUGGESTED = [
  'الخرطوم', 'أم درمان', 'بحري', 'مدني', 'بورتسودان',
  'كسلا', 'الأبيض', 'عطبرة', 'القضارف', 'نيالا',
];

export function DeliveryZonesStep({ storeId, count, onChange, onNext }: {
  storeId: string;
  count: number;
  onChange: (count: number) => void;
  onNext: () => void;
}) {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [fee, setFee] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refresh = () => start(async () => {
    const res = await listDeliveryZones(storeId);
    setLoading(false);
    if (!res.ok) { setError(res.message); return; }
    setError(null);
    setZones(res.data);
    onChange(res.data.filter((z) => z.isActive).length);
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [storeId]);

  const add = () => start(async () => {
    setError(null);
    const parsedFee = Number(fee.replace(/,/g, ''));
    const res = await saveDeliveryZone({
      storeId, name, fee: Number.isFinite(parsedFee) ? parsedFee : NaN,
    });
    if (!res.ok) { setError(res.message); return; }
    setName('');
    setFee('');
    refresh();
  });

  const remove = (zoneId: string) => start(async () => {
    setError(null);
    const res = await deleteDeliveryZone(storeId, zoneId);
    if (!res.ok) { setError(res.message); return; }
    refresh();
  });

  const active = zones.filter((z) => z.isActive);
  // قبل انتهاء التحميل نعتمد العدّ الآتي من الخادم مع الصفحة، فلا يُعطَّل
  // زر «التالي» لحظةً على متجر لديه مناطق فعلًا.
  const known = loading ? count : active.length;

  return (
    <Card>
      <div className="border-b border-sand-200 px-5 py-4">
        <h2 className="font-bold text-navy-900">مناطق التوصيل</h2>
        <p className="mt-0.5 text-sm text-sand-600">
          منطقة واحدة على الأقل مطلوبة. أجرة التوصيل تُحتسب من هنا وقت الطلب.
        </p>
      </div>

      <div className="space-y-4 p-5">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                          border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                          text-sm text-[--color-danger]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-sand-600">يحمّل المناطق…</p>
        ) : active.length === 0 ? (
          <div className="flex items-center gap-2 rounded-[--radius-md] border border-dashed
                          border-sand-300 p-4 text-sm text-sand-600">
            <Truck size={16} /> لم تُضِف أي منطقة بعد.
          </div>
        ) : (
          <ul className="divide-y divide-sand-200 rounded-[--radius-md] border border-sand-200">
            {active.map((z) => (
              <li key={z.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex-1 truncate font-bold text-navy-900">{z.name}</span>
                <span className="font-bold text-navy-900 tabular">{formatMoney(z.fee)}</span>
                <button type="button" aria-label={`حذف ${z.name}`} disabled={pending}
                        onClick={() => remove(z.id)}
                        className="rounded p-2 text-[--color-danger] hover:bg-[--color-danger-bg]
                                   disabled:opacity-50">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <Input label="المدينة أو المنطقة" value={name} maxLength={80}
                 placeholder="مثال: الخرطوم"
                 onChange={(e) => setName(e.target.value)} />
          <Input label="الأجرة" value={fee} type="number" min={0} step="0.01"
                 inputMode="decimal" dir="ltr" className="sm:w-32"
                 onChange={(e) => setFee(e.target.value)} />
          <Button type="button" icon={<Plus size={16} />} loading={pending}
                  disabled={name.trim().length < 2 || fee.trim() === ''}
                  onClick={add}>
            إضافة
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED.filter((s) => !active.some((z) => z.name === s)).map((s) => (
            <button key={s} type="button" onClick={() => setName(s)}
                    className="rounded-full border border-sand-300 px-2.5 py-1
                               text-xs font-bold text-sand-700 hover:border-nile-400
                               hover:text-nile-600">
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end border-t border-sand-200 px-5 py-4">
        <Button onClick={onNext} disabled={known === 0}
                icon={<ChevronLeft size={16} className="flip-rtl" />}>
          التالي
        </Button>
      </div>
    </Card>
  );
}
