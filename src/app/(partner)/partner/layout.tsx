import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Handshake } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { SkipLink } from '@/components/ui/SkipLink';

/**
 * منطقة الشريك.
 *
 * منفصلة عن لوحة التاجر ولوحة الإدارة تمامًا: الشريك ليس تاجرًا ولا
 * موظف منصة، ولا يشترك معهما في أي تنقّل أو بيانات.
 */
export default async function PartnerLayout({ children }: LayoutProps<'/partner'>) {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login?next=/partner');
  // ليس شريكًا ⇒ 404 لا 403: لا نؤكد وجود المنطقة لمن لا يخصّه
  if (!actor.partnerId) redirect('/');

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <SkipLink />
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4">
          <Link href="/partner"
                className="inline-flex items-center gap-2 font-extrabold text-ink-900">
            <Handshake size={20} className="text-gold-700" />
            برنامج الشركاء
          </Link>
          <Link href="/" className="ms-auto text-sm font-bold text-ink-500
                     hover:text-teal-700">
            سوق النيل
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
