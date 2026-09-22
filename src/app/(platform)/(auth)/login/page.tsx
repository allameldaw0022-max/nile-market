import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getActor } from '@/lib/auth/actor';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'تسجيل الدخول' };

export default async function LoginPage() {
  const actor = await getActor();
  if (actor.kind === 'user') redirect('/dashboard');

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-extrabold text-ink-900">تسجيل الدخول</h1>
      <p className="mt-1 text-sm text-ink-500">أهلًا بعودتك إلى سوق النيل.</p>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-ink-500">
        ليس لديك حساب؟{' '}
        <Link href="/signup" className="font-bold text-teal-700 hover:underline">أنشئ حسابًا</Link>
      </p>
    </div>
  );
}
