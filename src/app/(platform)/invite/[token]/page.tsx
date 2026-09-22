import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { AcceptInvite } from './AcceptInvite';

export const metadata: Metadata = {
  title: 'دعوة انضمام',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * صفحة قبول الدعوة.
 *
 * التوكن في المسار سرّ: لا يُعرض محتواه ولا تفاصيل المتجر قبل القبول،
 * لأن عرضها قبل التحقق يجعل الرابط أداة استطلاع. غير المسجَّل يُحوَّل
 * إلى الدخول ثم يعود إلى نفس الرابط.
 */
export default async function InvitePage({ params }: PageProps<'/invite/[token]'>) {
  const { token } = await params;
  const actor = await getActor();

  if (actor.kind !== 'user') {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <AcceptInvite token={token} />
    </div>
  );
}
