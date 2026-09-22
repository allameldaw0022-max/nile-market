import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { TicketThread } from '@/components/support/TicketThread';
import { loadTicket } from '@/lib/support/actions';

export const metadata: Metadata = {
  title: 'تذكرة دعم',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function TicketPage({ params }: PageProps<'/support/[id]'>) {
  const actor = await getActor();
  const { id } = await params;
  if (actor.kind !== 'user') redirect(`/login?next=/support/${id}`);

  const ticket = await loadTicket(id);
  if (!ticket.ok) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/support"
            className="inline-flex items-center gap-1 text-sm font-bold text-sand-600
                       hover:text-nile-600">
        <ChevronRight size={15} /> الدعم
      </Link>

      <div className="mt-6">
        <TicketThread ticket={ticket.data} />
      </div>
    </div>
  );
}
