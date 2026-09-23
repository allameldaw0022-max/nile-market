'use client';
import { useActionState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { storefrontUpdatePassword, type StoreAuthResult } from '@/lib/auth/storefront';

/** نموذج كلمة المرور الجديدة — بمكوّنات نظام التصميم القائمة. */
export function StoreResetForm() {
  const [state, action, pending] =
    useActionState<StoreAuthResult | null, FormData>(storefrontUpdatePassword, null);

  return (
    <Card className="p-6">
      <h1 className="text-[20px] font-bold text-ink-900">كلمة مرور جديدة</h1>
      <p className="mt-1 text-[14px] text-ink-500">اختر كلمة مرور لحسابك.</p>

      {state && !state.ok && state.message && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-md border
                      border-danger/30 bg-danger-bg p-3 text-[13px] text-ink-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          {state.message}
        </p>
      )}

      <form action={action} className="mt-5 space-y-4">
        <Input name="password" type="password" label="كلمة المرور الجديدة"
               required autoComplete="new-password" hint="٨ أحرف على الأقل" />
        <Button type="submit" loading={pending} className="w-full">حفظ</Button>
      </form>
    </Card>
  );
}
