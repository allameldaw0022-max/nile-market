import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getActor } from '@/lib/auth/actor';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = { title: 'إنشاء حساب' };

export default async function SignupPage() {
  const actor = await getActor();
  if (actor.kind === 'user') redirect('/onboarding');

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-extrabold text-navy-900">أنشئ حسابك</h1>
      <p className="mt-1 text-sm text-sand-600">
        خطوة واحدة تفصلك عن إنشاء متجرك.
      </p>
      <SignupForm />
      <p className="mt-6 text-center text-sm text-sand-600">
        لديك حساب؟{' '}
        <Link href="/login" className="font-bold text-nile-600 hover:underline">سجّل الدخول</Link>
      </p>
      <p className="mt-4 text-center text-xs text-sand-600">
        بإنشائك حسابًا فإنك توافق على{' '}
        <Link href="/legal/terms" className="underline">الشروط</Link> و
        <Link href="/legal/privacy" className="underline">سياسة الخصوصية</Link>.
      </p>
    </div>
  );
}
