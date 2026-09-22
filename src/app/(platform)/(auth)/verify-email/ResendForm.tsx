'use client';
import { useActionState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { resendVerification, type AuthResult } from '../actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

export function ResendForm() {
  const [state, action, pending] =
    useActionState<AuthResult | null, FormData>(resendVerification, null);

  return (
    <form action={action} className="space-y-4">
      {state && (
        <div role="status" className={`flex items-start gap-2 rounded-[--radius-md] border p-3 text-sm ${
          state.ok
            ? 'border-[--color-success]/30 bg-[--color-success-bg] text-navy-900'
            : 'border-[--color-danger]/30 bg-[--color-danger-bg] text-[--color-danger]'}`}>
          {state.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[--color-success]" />
                    : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          {state.message}
        </div>
      )}
      <Input name="email" type="email" label="البريد الإلكتروني" required autoComplete="email" />
      <Button type="submit" variant="outline" className="w-full" loading={pending}>
        إعادة إرسال رابط التأكيد
      </Button>
    </form>
  );
}
