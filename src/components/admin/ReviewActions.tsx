'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';

export type ReviewAction = {
  key: string;
  label: string;
  tone?: 'primary' | 'danger' | 'outline';
  /** يطلب سببًا إلزاميًا قبل التنفيذ. */
  needsReason?: boolean;
  reasonLabel?: string;
};

/**
 * أزرار مراجعة موحّدة (اعتماد · رفض · تسجيل · صرف).
 *
 * ★ لا يقرّر هذا المكوّن شيئًا: كل ما يفعله هو نداء فعل خادمي يعيد
 * فحص الصلاحية وفصل المهام في القاعدة. رسالة الرفض التي تظهر هنا
 * هي رسالة القاعدة نفسها.
 */
export function ReviewActions({ actions, onRun, hint }: {
  actions: ReviewAction[];
  onRun: (key: string, reason?: string) => Promise<{ ok: boolean; message?: string }>;
  hint?: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState<ReviewAction | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (action: ReviewAction, why?: string) => start(async () => {
    setError(null);
    const res = await onRun(action.key, why);
    if (!res.ok) { setError(res.message ?? 'تعذّر تنفيذ الإجراء'); return; }
    setAsking(null);
    setReason('');
    router.refresh();
  });

  if (asking) {
    return (
      <div className="w-full space-y-3 rounded-[--radius-md] border
                      border-[--color-danger]/30 p-4">
        <p className="text-sm font-bold text-navy-900">
          {asking.reasonLabel ?? 'السبب'}
        </p>
        <p className="text-xs text-sand-600">
          السبب إلزامي ويُحفظ في السجل، ويصل صاحب الطلب.
        </p>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
                  aria-label={asking.reasonLabel ?? 'السبب'} />
        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-sm
                          text-[--color-danger]">
            <AlertTriangle size={14} />{error}
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="danger" loading={pending}
                  disabled={reason.trim().length < 3}
                  onClick={() => run(asking, reason.trim())}>
            تأكيد
          </Button>
          <Button variant="ghost" onClick={() => { setAsking(null); setError(null); }}>
            تراجع
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button key={action.key} size="sm" loading={pending}
                  variant={action.tone === 'danger' ? 'danger'
                    : action.tone === 'outline' ? 'outline' : 'primary'}
                  icon={action.tone === 'danger' ? <X size={14} /> : <Check size={14} />}
                  onClick={() => {
                    if (action.needsReason) { setAsking(action); setError(null); }
                    else run(action);
                  }}>
            {action.label}
          </Button>
        ))}
      </div>

      {hint && (
        <p className="flex items-center gap-1 text-[11px] text-sand-600">
          <ShieldAlert size={11} />{hint}
        </p>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-xs
                        text-[--color-danger]">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}
