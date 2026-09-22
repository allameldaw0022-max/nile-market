'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { formatMoney } from '@/lib/money/format';
import { recordOrderPayment } from '@/app/(dashboard)/dashboard/orders/actions';
import { PAYMENT_METHOD } from '@/lib/status';

/**
 * تسجيل دفعة على طلب.
 *
 * المبلغ المتبقي معروض للتيسير فقط؛ ما يُحتسب هو ما تحفظه القاعدة،
 * وهي التي تعيد حساب حالة الدفع بعد كل دفعة. المفتاح يُولَّد على
 * الخادم مع الصفحة فلا تُسجَّل الدفعة مرتين بضغطتين.
 */
export function RecordPaymentForm({ storeId, orderId, remaining, idempotencyKey }: {
  storeId: string;
  orderId: string;
  remaining: number;
  idempotencyKey: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (formData: FormData) => start(async () => {
    setError(null);
    const amount = Number(String(formData.get('amount') ?? '').replace(/,/g, ''));
    const res = await recordOrderPayment({
      storeId, orderId, idempotencyKey,
      amount,
      method: String(formData.get('method')) as 'cash_on_delivery' | 'bank_transfer' | 'bankak',
      reference: String(formData.get('reference') ?? ''),
    });
    if (!res.ok) { setError({ message: res.message, field: res.field }); return; }
    setOpen(false);
    router.refresh();
  });

  if (!open) {
    return (
      <Button variant="outline" icon={<Wallet size={15} />} onClick={() => setOpen(true)}>
        تسجيل دفعة
      </Button>
    );
  }

  return (
    <form action={submit} className="space-y-3 rounded-[--radius-md] border
                                     border-ink-200 p-4">
      <p className="text-sm font-bold text-ink-900">تسجيل دفعة</p>
      <p className="text-xs text-ink-500 tabular">
        المتبقي على الطلب: {formatMoney(remaining)}
      </p>

      {error && !error.field && (
        <p role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error.message}
        </p>
      )}

      <Input name="amount" label="المبلغ" required type="number" min={0.01} step="0.01"
             inputMode="decimal" dir="ltr" defaultValue={remaining > 0 ? remaining : ''}
             error={error?.field === 'amount' ? error.message : undefined} />

      <Select name="method" label="طريقة الدفع" required defaultValue="cash_on_delivery">
        {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </Select>

      <Input name="reference" label="مرجع التحويل (اختياري)" dir="ltr"
             hint="رقم العملية أو اسم المحوِّل." />

      <div className="flex gap-2">
        <Button type="submit" loading={pending}>حفظ الدفعة</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
      </div>
    </form>
  );
}
