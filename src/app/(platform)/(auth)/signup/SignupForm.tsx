'use client';
import { useActionState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { signUp, type AuthResult } from '../actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthResult | null, FormData>(signUp, null);

  if (state?.ok && state.message) {
    return (
      <div className="mt-8 rounded-lg border border-success/30
                      bg-success-bg p-5 text-center">
        <CheckCircle2 className="mx-auto mb-2 text-success" size={28} />
        <p className="font-bold text-ink-900">تحقق من بريدك</p>
        <p className="mt-1 text-sm text-ink-500">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-4">
      {state && !state.ok && (
        <div role="alert"
             className="flex items-start gap-2 rounded-md border
                        border-danger/30 bg-danger-bg p-3
                        text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {state.message}
        </div>
      )}

      <Input name="full_name" label="الاسم الكامل" required autoComplete="name" />
      <Input name="email" type="email" label="البريد الإلكتروني" required
             autoComplete="email" placeholder="you@example.com" />
      <Input name="password" type="password" label="كلمة المرور" required
             autoComplete="new-password" minLength={8}
             hint="8 أحرف على الأقل" />

      <Button type="submit" className="w-full" size="lg" loading={pending}>
        إنشاء الحساب
      </Button>
    </form>
  );
}
