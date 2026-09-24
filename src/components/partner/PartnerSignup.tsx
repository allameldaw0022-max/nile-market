'use client';
import { useActionState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import {
  signUpAsPartner, signInWithGoogleAsPartner, type AuthResult,
} from '@/app/(platform)/(auth)/actions';

/**
 * تسجيل الشريك — نفس نظام المصادقة، بوجهة مختلفة.
 *
 * ★ لا مسار مصادقة ثانٍ: `signUpAsPartner` تنادي `signUp` نفسها
 * وتضع كوكي النيّة قبلها، فيعود صاحبها بعد التأكيد إلى بوابة
 * الشراكة بدل لوحة التاجر.
 */
export function PartnerSignup() {
  const [state, action, pending] = useActionState<AuthResult | null, FormData>(
    signUpAsPartner, null);
  const [googlePending, startGoogle] = useTransition();

  if (state?.ok && state.message) {
    return (
      <div className="mt-8 rounded-lg border border-success/30
                      bg-success-bg p-5 text-center">
        <CheckCircle2 className="mx-auto mb-2 text-success" size={28} />
        <p className="font-bold text-ink-900">تحقق من بريدك</p>
        <p className="mt-1 text-sm text-ink-500">{state.message}</p>
        <p className="mt-2 text-xs text-ink-500">
          بعد التأكيد سيُنشأ ملف الشريك ويظهر لك رابط الإحالة.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {state && !state.ok && (
        <div role="alert"
             className="flex items-start gap-2 rounded-md border
                        border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {state.message}
        </div>
      )}

      <Button type="button" variant="outline" className="w-full" size="lg"
              loading={googlePending}
              onClick={() => startGoogle(() => { void signInWithGoogleAsPartner(); })}>
        <GoogleMark /> المتابعة بحساب Google
      </Button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-ink-200" />
        <span className="text-xs text-ink-500">أو بالبريد</span>
        <span className="h-px flex-1 bg-ink-200" />
      </div>

      <form action={action} className="space-y-4">
        <Input name="full_name" label="الاسم الكامل" required autoComplete="name" />
        <Input name="email" type="email" label="البريد الإلكتروني" required
               autoComplete="email" placeholder="you@example.com" />
        <Input name="password" type="password" label="كلمة المرور" required
               autoComplete="new-password" minLength={8} hint="8 أحرف على الأقل" />
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          إنشاء حساب الشريك
        </Button>
      </form>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}
