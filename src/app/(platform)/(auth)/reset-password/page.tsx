import type { Metadata } from 'next';
import { ResetForm } from './ResetForm';

export const metadata: Metadata = { title: 'تعيين كلمة مرور جديدة' };

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-extrabold text-navy-900">كلمة مرور جديدة</h1>
      <p className="mt-1 text-sm text-sand-600">اختر كلمة مرور قوية لحسابك.</p>
      <ResetForm />
    </div>
  );
}
