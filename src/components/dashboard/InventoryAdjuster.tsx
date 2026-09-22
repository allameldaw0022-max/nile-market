'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Minus, Plus } from 'lucide-react';
import { adjustInventory } from '@/app/(dashboard)/dashboard/products/actions';

/**
 * تعديل مخزون صف واحد.
 *
 * الرصيد المعروض يُحدَّث من رد الخادم لا من حساب محلي: الكمية قد
 * تكون تغيّرت بطلب زبون بين التحميل والضغط، والرقم الصحيح هو ما
 * تعيده القاعدة بعد تسجيل الحركة.
 */
export function InventoryAdjuster({ storeId, productId, quantity }: {
  storeId: string; productId: string; quantity: number;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(quantity);
  const [amount, setAmount] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const apply = (sign: 1 | -1) => start(async () => {
    setError(null);
    setSaved(false);
    const step = Math.trunc(Number(amount));
    if (!Number.isFinite(step) || step <= 0) {
      setError('أدخل كمية أكبر من صفر');
      return;
    }

    const res = await adjustInventory({
      storeId, productId, delta: sign * step,
    });
    if (!res.ok) { setError(res.message); return; }

    setCurrent(res.data.quantity);
    setSaved(true);
    router.refresh();
  });

  const btn = 'flex size-9 items-center justify-center rounded-[--radius-md] ' +
              'border border-sand-300 text-navy-700 hover:border-nile-500 ' +
              'hover:text-nile-600 disabled:opacity-50';

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={pending || current === 0}
                aria-label="إنقاص المخزون" onClick={() => apply(-1)}>
          <Minus size={15} />
        </button>

        <input value={amount} onChange={(e) => setAmount(e.target.value)}
               type="number" min={1} step={1} inputMode="numeric" dir="ltr"
               aria-label="مقدار التعديل"
               className="h-9 w-16 rounded-[--radius-md] border border-sand-300 bg-white
                          px-2 text-center text-sm tabular text-navy-900
                          focus:border-nile-500" />

        <button type="button" className={btn} disabled={pending}
                aria-label="زيادة المخزون" onClick={() => apply(1)}>
          <Plus size={15} />
        </button>

        <span className="ms-2 min-w-14 text-end font-bold tabular text-navy-900">
          {current}
          {saved && <Check size={13} className="ms-1 inline text-[--color-success]" />}
        </span>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1 text-xs font-bold
                        text-[--color-danger]">
          <AlertTriangle size={12} />{error}
        </p>
      )}
    </div>
  );
}
