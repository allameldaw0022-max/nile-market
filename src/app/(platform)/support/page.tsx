import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { LifeBuoy, Plus } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { StatusChip } from '@/components/ui/Badge';
import { TICKET_STATUS } from '@/lib/status';
import { formatDateTime } from '@/lib/money/format';
import { listMyTickets } from '@/lib/support/actions';
import { TICKET_CATEGORY_LABEL } from '@/lib/support/categories';

export const metadata: Metadata = {
  title: 'الدعم',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login?next=/support');

  const tickets = await listMyTickets();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy-900">الدعم الفني</h1>
          <p className="text-sm text-sand-600">
            افتح تذكرة وسنتابع معك حتى الحل.
          </p>
        </div>
        <Link href="/support/new">
          <Button icon={<Plus size={16} />}>تذكرة جديدة</Button>
        </Link>
      </div>

      <div className="mt-6">
        {!tickets.ok ? (
          <ErrorState description={tickets.message} />
        ) : tickets.data.length === 0 ? (
          <EmptyState
            icon={<LifeBuoy size={36} strokeWidth={1.5} />}
            title="لا تذاكر بعد"
            description="إن واجهتك مشكلة، افتح تذكرة ووضّح ما حدث."
            action={<Link href="/support/new"><Button>تذكرة جديدة</Button></Link>}
          />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-sand-200">
              {tickets.data.map((t) => (
                <li key={t.id}>
                  <Link href={`/support/${t.id}`}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5
                                   hover:bg-sand-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-navy-900">{t.subject}</p>
                      <p className="text-xs text-sand-600">
                        <span className="tabular" dir="ltr">{t.ticketNumber}</span>
                        {' · '}{TICKET_CATEGORY_LABEL[t.category] ?? t.category}
                        {' · '}{formatDateTime(t.lastMessageAt)}
                      </p>
                    </div>
                    <StatusChip map={TICKET_STATUS} value={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
