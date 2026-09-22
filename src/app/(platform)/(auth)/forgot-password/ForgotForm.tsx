'use client';
import { useActionState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { requestPasswordReset, type AuthResult } from '../actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

export function ForgotForm() {
  const [state, action, pending] =
    useActionState<AuthResult | null, FormData>(requestPasswordReset, null);

  if (state?.ok) {
    return (
      <div className="mt-8 rounded-[--radius-lg] border border-[--color-success]/30
                      bg-[--color-success-bg] p-5 text-center">
        <CheckCircle2 className="mx-auto mb-2 text-[--color-success]" size={28} />
        <p className="text-sm text-navy-900">{state.message}</p>
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
      <Input name="email" type="email" label="البريد الإلكتروني" required autoComplete="email" />
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        إرسال رابط الاستعادة
      </Button>
    </form>
  );
}
