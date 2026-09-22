'use client';
import Link from 'next/link';
import { useActionState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { signIn, signInWithGoogle, type AuthResult } from '../actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { safeNext } from '@/lib/safe-next';

const URL_ERRORS: Record<string, string> = {
  oauth_failed: 'تعذّر الدخول بحساب Google، حاول مجددًا',
  invalid_link: 'الرابط غير صالح',
  expired_link: 'انتهت صلاحية الرابط — اطلب رابطًا جديدًا',
};

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthResult | null, FormData>(signIn, null);
  const [googlePending, startGoogle] = useTransition();
  const params = useSearchParams();
  const urlError = URL_ERRORS[params.get('error') ?? ''];
  const signedOutAll = params.get('signed_out') === 'all';
  // وجهة العودة يُنقّيها الخادم أيضًا (هو الحاجز). تُنقّى هنا كذلك
  // حتى لا يحمل النموذج المعروض حمولة هجوم أصلًا.
  const next = params.get('next') ? safeNext(params.get('next'), '') : '';

  return (
    <form action={action} className="mt-8 space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {signedOutAll && (
        <p role="status" className="rounded-[--radius-md] border border-nile-200
                       bg-nile-50 p-3 text-sm text-navy-700">
          أُنهيت كل جلساتك على جميع الأجهزة. سجّل الدخول من جديد.
        </p>
      )}
      {urlError && (
        <div role="alert" className="flex items-start gap-2 rounded-[--radius-md] border
                        border-[--color-danger]/30 bg-[--color-danger-bg] p-3
                        text-sm text-[--color-danger]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />{urlError}
        </div>
      )}
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

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-sand-200" />
        <span className="text-xs text-sand-600">أو</span>
        <span className="h-px flex-1 bg-sand-200" />
      </div>

      <Button type="button" variant="outline" className="w-full" size="lg"
              loading={googlePending}
              onClick={() => startGoogle(() => { void signInWithGoogle(); })}>
        <GoogleMark /> الدخول بحساب Google
      </Button>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"/>
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.3v3.1A12 12 0 0 0 12 24Z"/>
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z"/>
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"/>
    </svg>
  );
}
