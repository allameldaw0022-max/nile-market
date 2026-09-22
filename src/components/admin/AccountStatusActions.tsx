'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { setAccountStatus } from '@/lib/admin/people';

/**
 * إيقاف حساب مستخدم أو إعادة تفعيله.
 *
 * ★ الحساب لا يُحذف: الإيقاف يمنع الدخول ويُبقي الطلبات والمتاجر
 * والسجلات كما هي. الحذف الفعلي مسار مستقل بطلب صاحبه.
 */
export function AccountStatusActions({ profileId, status }: {
  profileId: string; status: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (next: 'active' | 'suspended', why?: string) => start(async () => {
    setError(null);
    const res = await setAccountStatus({ profileId, status: next, reason: why });
    if (!res.ok) { setError(res.message); return; }
    setAsking(false);
    setReason('');
    router.refresh();
  });

  if (asking) {
    return (
      <div className="w-full space-y-2">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
                  aria-label="سبب الإيقاف"
                  placeholder="سبب الإيقاف — يُحفظ في سجل التدقيق" />
        {error && (
          <p role="alert" className="text-xs text-[--color-danger]">{error}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="danger" loading={pending}
                  disabled={reason.trim().length < 3}
                  onClick={() => run('suspended', reason.trim())}>
            تأكيد الإيقاف
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
            تراجع
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {status === 'active' ? (
        <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
          إيقاف
        </Button>
      ) : (
        <Button size="sm" variant="outline" loading={pending}
                onClick={() => run('active')}>
          إعادة التفعيل
        </Button>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-1 text-xs text-[--color-danger]">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}
