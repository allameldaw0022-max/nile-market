import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { requireStoreAccess } from '@/lib/authz/guards';
import { ImportWizard } from './ImportWizard';

export const metadata: Metadata = { title: 'استيراد المنتجات' };

export default async function ImportProductsPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'products:create');

  return (
    <div className="space-y-5">
      <Link href="/dashboard/products"
            className="inline-flex items-center gap-1 text-sm font-bold text-sand-600
                       hover:text-nile-600">
        <ChevronRight size={15} /> المنتجات
      </Link>
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">استيراد المنتجات</h1>
        <p className="text-sm text-sand-600">
          ارفع ملفك، راجع ما سيُستورَد، ثم أكّد. المنتجات تُضاف كمسودّات.
        </p>
      </div>

      <ImportWizard storeId={membership.storeId} />
    </div>
  );
}
