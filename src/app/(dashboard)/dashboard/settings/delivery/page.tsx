import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { listDeliveryZones } from '@/lib/delivery/actions';
import { DeliveryZonesManager } from '@/components/dashboard/DeliveryZonesManager';
import { ErrorState } from '@/components/ui/States';

export const metadata: Metadata = { title: 'مناطق التوصيل' };

export default async function DeliverySettingsPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'settings:view');
  const zones = await listDeliveryZones(membership.storeId);

  return (
    <div className="space-y-5">
      <Link href="/dashboard/settings"
            className="inline-flex items-center gap-1 text-sm font-bold text-sand-600
                       hover:text-nile-600">
        <ChevronRight size={15} /> الإعدادات
      </Link>

      <div>
        <h1 className="text-xl font-extrabold text-navy-900">مناطق التوصيل</h1>
        <p className="text-sm text-sand-600">
          الأجرة هنا هي التي تُحتسب على الطلب — لا يُرسل الرسم من المتصفح.
        </p>
      </div>

      {zones.ok ? (
        <DeliveryZonesManager storeId={membership.storeId} zones={zones.data}
                              canManage={can(membership, 'delivery:manage')} />
      ) : (
        <ErrorState description={zones.message} />
      )}
    </div>
  );
}
