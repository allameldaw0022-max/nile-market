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
        <div role="status" className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
          state.ok
            ? 'border-success/30 bg-success-bg text-ink-900'
            : 'border-danger/30 bg-danger-bg text-danger'}`}>
          {state.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
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
