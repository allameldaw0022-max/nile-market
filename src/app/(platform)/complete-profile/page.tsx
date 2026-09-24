import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { MessageCircle } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-next';
import { PhoneStep } from './PhoneStep';

export const metadata: Metadata = {
  title: 'أكمل بياناتك',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * خطوة الرقم بعد الدخول بـGoogle.
 *
 * ★ التسجيل بالبريد يسأل عن الرقم في نموذجه، وGoogle لا يمرّر رقمًا
 * إطلاقًا. فهذه الخطوة تسدّ الفجوة لمن دخل به — ومن له رقم أصلًا
 * لا يراها.
 *
 * ★ الوجهة من قائمة بيضاء (`safeNext`): معامل `next` يأتي من رابط،
 * ولا يُقبل منه مسار خارجي.
 */
export default async function CompleteProfilePage(
  { searchParams }: PageProps<'/complete-profile'>,
) {
  const actor = await getActor();
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === 'string' ? sp.next : null, '/dashboard');

  if (actor.kind !== 'user') {
    redirect(`/login?next=${encodeURIComponent('/complete-profile')}`);
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles').select('phone').eq('id', actor.userId).maybeSingle();

  // له رقم ⇒ لا خطوة. والمتابعة لا تُفرض على من تجاوزها بالرابط:
  // الرقم بيان تواصل لا حاجز أمان.
  if (data?.phone) redirect(next);

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-14">
      <span className="mx-auto grid size-12 place-items-center rounded-full
                       bg-teal-50 text-teal-700">
        <MessageCircle size={22} />
      </span>
      <h1 className="mt-4 text-center text-2xl font-extrabold text-ink-900">
        خطوة أخيرة
      </h1>
      <p className="mt-2 text-center text-sm leading-relaxed text-ink-600">
        أضف رقم واتساب نتواصل معك عليه إن احتجت مساعدة في إكمال متجرك.
      </p>

      <PhoneStep next={next} />
    </div>
  );
}
