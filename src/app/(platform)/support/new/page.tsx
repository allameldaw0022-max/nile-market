import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { NewTicketForm } from '@/components/support/NewTicketForm';

export const metadata: Metadata = {
  title: 'تذكرة دعم جديدة',
  robots: { index: false, follow: false },
};

export default async function NewTicketPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login?next=/support/new');

  const stores = actor.stores.map((s) => ({ id: s.storeId, name: s.storeName }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/support"
            className="inline-flex items-center gap-1 text-sm font-bold text-sand-600
                       hover:text-nile-600">
        <ChevronRight size={15} /> الدعم
      </Link>

      <h1 className="mt-4 text-xl font-extrabold text-navy-900">تذكرة جديدة</h1>
      <p className="text-sm text-sand-600">
        اشرح المشكلة بالتفصيل، واذكر رقم الطلب أو المنتج إن وُجد.
      </p>

      <div className="mt-6">
        <NewTicketForm stores={stores} />
      </div>
    </div>
  );
}
