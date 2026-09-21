'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { signIn, type AuthResult } from '../actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthResult | null, FormData>(signIn, null);

  return (
    <form action={action} className="mt-8 space-y-4">
      {state && !state.ok && (
        <div role="alert"
             className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {state.message}
        </div>
      )}

      <Input name="email" type="email" label="البريد الإلكتروني" required
             autoComplete="email" placeholder="you@example.com" />
      <Input name="password" type="password" label="كلمة المرور" required
             autoComplete="current-password" />

      <div className="flex justify-start">
        <Link href="/forgot-password" className="text-xs font-bold text-nile-600 hover:underline">
          نسيت كلمة المرور؟
        </Link>
      </div>

      <Button type="submit" className="w-full" size="lg" loading={pending}>
        دخول
      </Button>
    </form>
  );
}
