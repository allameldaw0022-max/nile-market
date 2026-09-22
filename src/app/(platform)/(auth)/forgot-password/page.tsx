import Link from 'next/link';
import type { Metadata } from 'next';
import { ForgotForm } from './ForgotForm';

export const metadata: Metadata = { title: 'استعادة كلمة المرور' };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-extrabold text-navy-900">استعادة كلمة المرور</h1>
      <p className="mt-1 text-sm text-sand-600">
        أدخل بريدك وسنرسل لك رابط تعيين كلمة مرور جديدة.
      </p>
      <ForgotForm />
      <p className="mt-6 text-center text-sm text-sand-600">
        <Link href="/login" className="font-bold text-nile-600 hover:underline">
          رجوع لتسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
