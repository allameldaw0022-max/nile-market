import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { PoliciesForm } from '@/components/dashboard/PoliciesForm';

export const metadata: Metadata = { title: 'سياسات المتجر' };

export default async function PoliciesPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'settings:view');

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('store_settings').select('policies')
    .eq('store_id', membership.storeId).maybeSingle();

  const policies = (settings?.policies ?? {}) as Record<string, string | undefined>;

  return (
    <div className="space-y-5">
      <Link href="/dashboard/settings"
            className="inline-flex items-center gap-1 text-sm font-bold text-sand-600
                       hover:text-nile-600">
        <ChevronRight size={15} /> الإعدادات
      </Link>

      <div>
        <h1 className="text-xl font-extrabold text-navy-900">سياسات المتجر</h1>
        <p className="text-sm text-sand-600">
          تظهر في صفحات متجرك. السياسة التي تتركها فارغة لا تُعرض بنص من عندنا.
        </p>
      </div>

      <PoliciesForm storeId={membership.storeId}
                    initial={{
                      shipping: policies.shipping ?? '',
                      returns: policies.returns ?? '',
                      privacy: policies.privacy ?? '',
                      terms: policies.terms ?? '',
                    }}
                    canEdit={can(membership, 'settings:update')} />
    </div>
  );
}
