'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { savePhone } from '@/lib/auth/profile-phone';

/** حقل واحد: الرقم. أي حقل آخر هنا يطيل خطوة غرضها ألّا تطول. */
export function PhoneStep({ next }: { next: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => start(async () => {
    setError(null);
    const res = await savePhone({ phone });
    if (!res.ok) { setError(res.message); return; }
    router.replace(next);
  });

  return (
    <div className="mt-8 space-y-4">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border
                        border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}
        </div>
      )}

      <Input label="رقم واتساب" value={phone} type="tel" dir="ltr" required
             inputMode="tel" autoComplete="tel" autoFocus
             placeholder="0912345678"
             onChange={(e) => setPhone(e.target.value)} />

      <Button className="w-full" size="lg" loading={pending}
              disabled={phone.trim().length < 9}
              icon={<ArrowLeft size={16} className="flip-rtl" />}
              onClick={submit}>
        متابعة
      </Button>
    </div>
  );
}
