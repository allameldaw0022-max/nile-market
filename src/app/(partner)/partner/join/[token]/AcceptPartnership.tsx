'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Handshake } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { acceptPartnerInvitation } from '@/lib/admin/people';

export function AcceptPartnership({ token }: { token: string }) {
  const router = useRouter();
  const [joined, setJoined] = useState<{ name: string; referralCode: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const accept = () => start(async () => {
    setError(null);
    const res = await acceptPartnerInvitation(token);
    if (!res.ok) { setError(res.message); return; }
    setJoined(res.data);
  });

  if (joined) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="mx-auto text-[--color-success]" size={40} />
        <h1 className="mt-3 text-lg font-extrabold text-navy-900">
          صرت شريكًا في نايل ماركت
        </h1>
        <p className="mt-1 text-sm text-sand-600">
          رمز الإحالة الخاص بك:{' '}
          <strong dir="ltr" className="tabular">{joined.referralCode}</strong>
        </p>
        <Button className="mt-6" onClick={() => router.push('/partner')}>
          الانتقال إلى لوحة الشريك
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 text-center">
      <Handshake className="mx-auto text-nile-500" size={40} />
      <h1 className="mt-3 text-lg font-extrabold text-navy-900">دعوة شراكة</h1>
      <p className="mt-1 text-sm text-sand-600">
        بقبولك تُربط الشراكة بحسابك الحالي، وتحصل على رمز إحالة تُنسب
        إليه المتاجر التي تجلبها.
      </p>

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-[--radius-md]
                        border border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-start text-sm text-[--color-danger]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}
        </p>
      )}

      <Button className="mt-6 w-full" loading={pending} onClick={accept}>
        قبول الدعوة
      </Button>
    </Card>
  );
}
