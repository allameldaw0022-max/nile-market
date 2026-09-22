'use client';
import { useState, useTransition } from 'react';
import { AlertTriangle, Check, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { saveCustomerNote } from '@/lib/customers/actions';

/** ملاحظة داخلية على العميل — لا تظهر له في أي واجهة. */
export function CustomerNote({ storeId, customerId, initial, canEdit }: {
  storeId: string; customerId: string; initial: string; canEdit: boolean;
}) {
  const [notes, setNotes] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!canEdit) {
    return (
      <p className="whitespace-pre-line text-sm text-ink-700">
        {initial || 'لا ملاحظات.'}
      </p>
    );
  }

  const submit = () => start(async () => {
    setError(null);
    setSaved(false);
    const res = await saveCustomerNote({ storeId, customerId, notes });
    if (!res.ok) { setError(res.message); return; }
    setSaved(true);
  });

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs text-ink-500">
        <Lock size={12} /> ملاحظة داخلية — لا يراها العميل.
      </p>

      <Textarea value={notes} onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
                maxLength={2000} aria-label="ملاحظة عن العميل"
                placeholder="مثال: يفضّل التوصيل بعد العصر." />

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-[--color-danger]">
          <AlertTriangle size={14} />{error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" loading={pending} onClick={submit}>حفظ الملاحظة</Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-bold
                           text-[--color-success]">
            <Check size={13} /> حُفظت
          </span>
        )}
      </div>
    </div>
  );
}
