'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Percent } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { setPartnerRate, setPartnerStatus } from '@/lib/admin/people';

/**
 * إجراءات الشريك.
 *
 * ★ النسبة حقل منفصل بصلاحية منفصلة: من يوقف شريكًا ليس بالضرورة من
 * يغيّر ما يستحقه. القاعدة ترفض غير `commissions:manage` حتى لو ظهر
 * الحقل بخطأ في الواجهة.
 */
export function PartnerRow({ partnerId, status, rate, canEdit, canRate }: {
  partnerId: string; status: string; rate: number;
  canEdit: boolean; canRate: boolean;
}) {
  const router = useRouter();
  const [editingRate, setEditingRate] = useState(false);
  const [value, setValue] = useState(String(rate));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () => start(async () => {
    setError(null);
    const res = await setPartnerStatus({
      partnerId, status: status === 'active' ? 'suspended' : 'active',
    });
    if (!res.ok) { setError(res.message); return; }
    router.refresh();
  });

  const saveRate = () => start(async () => {
    setError(null);
    const res = await setPartnerRate({ partnerId, rate: Number(value) });
    if (!res.ok) { setError(res.message); return; }
    setEditingRate(false);
    router.refresh();
  });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {editingRate ? (
          <>
            <input type="number" min={0} max={100} step="0.01" value={value}
                   aria-label="نسبة العمولة"
                   onChange={(e) => setValue(e.target.value)}
                   className="h-8 w-20 rounded-md border border-ink-400
                              px-2 text-sm tabular text-ink-900" />
            <Button size="sm" loading={pending} onClick={saveRate}>حفظ</Button>
            <Button size="sm" variant="ghost"
                    onClick={() => { setEditingRate(false); setValue(String(rate)); }}>
              تراجع
            </Button>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-0.5 text-xs font-bold
                             tabular text-ink-600">
              <Percent size={11} />{rate}
            </span>
            {canRate && (
              <Button size="sm" variant="ghost" onClick={() => setEditingRate(true)}>
                تعديل النسبة
              </Button>
            )}
            {canEdit && status !== 'invited' && (
              <Button size="sm" loading={pending}
                      variant={status === 'active' ? 'danger' : 'outline'}
                      onClick={toggle}>
                {status === 'active' ? 'إيقاف' : 'إعادة التفعيل'}
              </Button>
            )}
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-1 text-xs text-danger">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}
