'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { acceptInvitation } from '@/lib/team/actions';
import { ROLE_LABEL } from '@/components/dashboard/TeamManager';

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const accept = () => start(async () => {
    setError(null);
    const res = await acceptInvitation(token);
    if (!res.ok) { setError(res.message); return; }
    setRole(res.data.role);
  });

  if (role) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="mx-auto text-[--color-success]" size={40} />
        <h1 className="mt-3 text-lg font-extrabold text-ink-900">انضممت إلى الفريق</h1>
        <p className="mt-1 text-sm text-ink-500">
          دورك: {ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? role}
        </p>
        <Button className="mt-6" onClick={() => router.push('/dashboard')}>
          الانتقال إلى لوحة التحكم
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 text-center">
      <UserPlus className="mx-auto text-teal-700" size={40} />
      <h1 className="mt-3 text-lg font-extrabold text-ink-900">دعوة انضمام لمتجر</h1>
      <p className="mt-1 text-sm text-ink-500">
        بقبولك تنضم إلى فريق المتجر بحسابك الحالي.
      </p>

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3 text-start
                        text-sm text-[--color-danger]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}
        </p>
      )}

      <Button className="mt-6 w-full" size="lg" loading={pending} onClick={accept}>
        قبول الدعوة
      </Button>
    </Card>
  );
}
