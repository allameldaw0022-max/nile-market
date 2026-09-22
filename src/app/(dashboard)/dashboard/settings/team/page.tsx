import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { getActor } from '@/lib/auth/actor';
import { can, requireStoreAccess } from '@/lib/authz/guards';
import { listTeam } from '@/lib/team/actions';
import { TeamManager } from '@/components/dashboard/TeamManager';
import { ErrorState } from '@/components/ui/States';

export const metadata: Metadata = { title: 'فريق العمل' };

export default async function TeamSettingsPage() {
  const actor = await getActor();
  if (actor.kind !== 'user') redirect('/login');
  const first = actor.stores[0];
  if (!first) redirect('/onboarding');

  const { membership } = await requireStoreAccess(first.storeId, 'members:view');
  const team = await listTeam(membership.storeId);

  return (
    <div className="space-y-5">
      <Link href="/dashboard/settings"
            className="inline-flex items-center gap-1 text-sm font-bold text-ink-500
                       hover:text-teal-700">
        <ChevronRight size={15} /> الإعدادات
      </Link>

      <div>
        <h1 className="text-xl font-extrabold text-ink-900">فريق العمل</h1>
        <p className="text-sm text-ink-500">
          كل دور يرى ما يخصه فقط — والمنع مفروض في القاعدة لا في الواجهة.
        </p>
      </div>

      {team.ok ? (
        <TeamManager storeId={membership.storeId}
                     members={team.data.members}
                     invitations={team.data.invitations}
                     canManage={can(membership, 'members:manage')}
                     isOwner={membership.role === 'owner'} />
      ) : (
        <ErrorState description={team.message} />
      )}
    </div>
  );
}
