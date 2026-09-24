import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Handshake } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { SkipLink } from '@/components/ui/SkipLink';
import { PartnerNav } from '@/components/partner/PartnerNav';

/**
 * منطقة الشريك.
 *
 * منفصلة عن لوحة التاجر ولوحة الإدارة تمامًا: الشريك ليس تاجرًا ولا
 * موظف منصة، ولا يشترك معهما في أي تنقّل أو بيانات.
 *
 * ★ من ليس شريكًا يُحوَّل إلى صفحة الانضمام لا إلى 404: الرابط
 * العام يدعو الناس إلى هنا، فالوجهة الطبيعية دعوة لا حائط.
 */
export default async function PartnerLayout({ children }: LayoutProps<'/partner'>) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login?next=/partner');
  if (!actor.partnerId) redirect('/partners/join');

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <SkipLink />
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Link href="/partner"
                className="inline-flex items-center gap-2 font-extrabold text-ink-900">
            <Handshake size={19} className="text-gold-700" />
            برنامج الشركاء
          </Link>
          <Link href="/" className="ms-auto text-sm font-bold text-ink-500
                     hover:text-teal-700">
            سوق النيل
          </Link>
        </div>
        <PartnerNav />
      </header>

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-5">
        {children}
      </main>
    </div>
  );
}
