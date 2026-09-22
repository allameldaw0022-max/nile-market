import type { Metadata } from 'next';
import { MailCheck } from 'lucide-react';
import { ResendForm } from './ResendForm';

export const metadata: Metadata = { title: 'تأكيد البريد الإلكتروني' };

export default function VerifyEmailPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <MailCheck className="mx-auto text-teal-700" size={40} strokeWidth={1.5} />
      <h1 className="mt-4 text-2xl font-extrabold text-ink-900">أكّد بريدك الإلكتروني</h1>
      <p className="mt-2 text-sm text-ink-500">
        أرسلنا رابط تأكيد إلى بريدك. افتحه لتفعيل حسابك.
        لم تستلم الرسالة؟ أعد الإرسال أدناه.
      </p>
      <div className="mt-8 text-start"><ResendForm /></div>
    </div>
  );
}
