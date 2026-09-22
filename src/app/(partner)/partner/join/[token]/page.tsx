import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { AcceptPartnership } from './AcceptPartnership';

export const metadata: Metadata = {
  title: 'دعوة شراكة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * قبول دعوة الشراكة.
 *
 * ★ التوكن في المسار سرّ: لا يُعرض اسم الشريك ولا نسبته قبل القبول،
 * لأن عرضها قبل التحقق يجعل الرابط أداة استطلاع. غير المسجَّل يُحوَّل
 * إلى الدخول ثم يعود إلى نفس الرابط.
 */
export default async function PartnerJoinPage(
  { params }: PageProps<'/partner/join/[token]'>,
) {
  const { token } = await params;
  const actor = await getActor();

  if (actor.kind !== 'user') {
    redirect(`/login?next=${encodeURIComponent(`/partner/join/${token}`)}`);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <AcceptPartnership token={token} />
    </div>
  );
}
