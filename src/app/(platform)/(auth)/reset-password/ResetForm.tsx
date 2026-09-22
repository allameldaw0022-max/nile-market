'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { updatePassword, type AuthResult } from '../actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

export function ResetForm() {
  const [state, action, pending] =
    useActionState<AuthResult | null, FormData>(updatePassword, null);

  if (state?.ok) {
    return (
      <div className="mt-8 rounded-[--radius-lg] border border-[--color-success]/30
                      bg-[--color-success-bg] p-5 text-center">
        <CheckCircle2 className="mx-auto mb-2 text-[--color-success]" size={28} />
        <p className="font-bold text-ink-900">{state.message}</p>
        <Link href="/dashboard" className="mt-4 inline-block">
          <Button size="sm">الانتقال إلى لوحة التحكم</Button>
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-4">
      {state && !state.ok && (
        <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{state.message}
        </div>
      )}
      <Input name="password" type="password" label="كلمة المرور الجديدة" required
             minLength={8} autoComplete="new-password" hint="8 أحرف على الأقل" />
      <Input name="confirm" type="password" label="تأكيد كلمة المرور" required
             minLength={8} autoComplete="new-password" />
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        حفظ كلمة المرور
      </Button>
    </form>
  );
}
