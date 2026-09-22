import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { listStoreDomains } from '@/lib/domains/actions';
import { DomainManager } from '@/components/dashboard/DomainManager';
import { ErrorState } from '@/components/ui/States';
import { config } from '@/lib/config';

export const metadata: Metadata = { title: 'الدومين' };

export default async function DomainSettingsPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'settings:view');
  const domains = await listStoreDomains(membership.storeId);

  return (
    <div className="space-y-5">
      <Link href="/dashboard/settings"
            className="inline-flex items-center gap-1 text-sm font-bold text-ink-500
                       hover:text-teal-700">
        <ChevronRight size={15} /> الإعدادات
      </Link>

      <div>
        <h1 className="text-xl font-extrabold text-ink-900">الدومين</h1>
        <p className="text-sm text-ink-500">
          نطاقك على سوق النيل يعمل دائمًا. يمكنك ربط دومين تملكه إلى جانبه.
        </p>
      </div>

      {domains.ok ? (
        <DomainManager storeId={membership.storeId} domains={domains.data}
                       canManage={can(membership, 'domain:manage')}
                       rootDomain={config.rootDomain} />
      ) : (
        <ErrorState description={domains.message} />
      )}
    </div>
  );
}
