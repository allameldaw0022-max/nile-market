'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import {
  storefrontResetRequest, storefrontSignIn, storefrontSignUp,
  type StoreAuthResult,
} from '@/lib/auth/storefront';

type Mode = 'login' | 'register' | 'reset';

const COPY: Record<Mode, { title: string; submit: string }> = {
  login:    { title: 'تسجيل الدخول', submit: 'دخول' },
  register: { title: 'إنشاء حساب',   submit: 'إنشاء الحساب' },
  reset:    { title: 'استعادة كلمة المرور', submit: 'أرسل رابط الاستعادة' },
};

/**
 * نموذج مصادقة عميل المتجر.
 *
 * ★ بمكوّنات نظام التصميم القائمة (`Card` · `Button` · `Input`) بلا
 * حرف واحد جديد في الألوان أو المسافات أو الطباعة.
 *
 * ★ `host` يُرسل في حقل مخفي **للتحقّق** لا للثقة: الفعل الخادمي
 * يحلّه عبر `resolveStoreByHost` ويرفض ما ليس متجرًا نشطًا. وقيمة
 * `store_id` لا تُرسل من المتصفّح إطلاقًا.
 *
 * ★ الحالة لا تُنقل باللون وحده: لكل رسالة أيقونة و`role` مناسب.
 */
export function StoreAuthForm({ host, storeName, next, mode, notice }: {
  host: string; storeName: string; next: string; mode: Mode; notice: string | null;
}) {
  const action = mode === 'register' ? storefrontSignUp
    : mode === 'reset' ? storefrontResetRequest
    : storefrontSignIn;

  const [state, formAction, pending] =
    useActionState<StoreAuthResult | null, FormData>(action, null);

  const copy = COPY[mode];

  return (
    <Card className="p-6">
      <h1 className="text-[20px] font-bold text-ink-900">{copy.title}</h1>
      <p className="mt-1 text-[14px] text-ink-500">
        {mode === 'register'
          ? <>أنشئ حسابك في {storeName} لتتابع طلباتك وتحفظ مفضّلتك.</>
          : mode === 'reset'
            ? <>أدخل بريدك وسنرسل لك رابطًا لإعادة تعيين كلمة المرور.</>
            : <>أهلًا بك في {storeName}.</>}
      </p>

      {notice === 'confirmed' && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-md border
                      border-success/30 bg-success-bg p-3 text-[13px] text-ink-900">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
          فُعِّل حسابك. سجّل الدخول للمتابعة.
        </p>
      )}

      {state && !state.ok && state.message && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-md border
                      border-danger/30 bg-danger-bg p-3 text-[13px] text-ink-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          {state.message}
        </p>
      )}

      {state?.ok && state.message && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-md border
                      border-success/30 bg-success-bg p-3 text-[13px] text-ink-900">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
          {state.message}
        </p>
      )}

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="host" value={host} />
        <input type="hidden" name="next" value={next} />

        {mode === 'register' && (
          <Input name="full_name" label="الاسم" required autoComplete="name" />
        )}

        <Input name="email" type="email" label="البريد الإلكتروني"
               required autoComplete="email" dir="ltr" />

        {mode !== 'reset' && (
          <Input name="password" type="password" label="كلمة المرور" required
                 autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                 hint={mode === 'register' ? '٨ أحرف على الأقل' : undefined} />
        )}

        <Button type="submit" loading={pending} className="w-full">
          {copy.submit}
        </Button>
      </form>

      <div className="mt-5 space-y-2 border-t border-ink-200 pt-4 text-[13px] text-ink-500">
        {mode === 'login' && (
          <>
            <p>
              ليس لديك حساب؟{' '}
              <Link href="/login?mode=register"
                    className="font-medium text-teal-700 underline underline-offset-4">
                أنشئ حسابًا
              </Link>
            </p>
            <p>
              <Link href="/login?mode=reset"
                    className="font-medium text-teal-700 underline underline-offset-4">
                نسيت كلمة المرور؟
              </Link>
            </p>
          </>
        )}
        {mode !== 'login' && (
          <p>
            <Link href="/login"
                  className="font-medium text-teal-700 underline underline-offset-4">
              العودة إلى تسجيل الدخول
            </Link>
          </p>
        )}
        <p className="pt-1 text-[12px]">
          يمكنك الشراء دون حساب — الحساب يحفظ طلباتك ومفضّلتك فقط.
        </p>
      </div>
    </Card>
  );
}
