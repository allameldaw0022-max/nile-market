import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { adminHasLevel, getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { loadAdminTicket } from '@/lib/admin/support';
import { AdminTicketView } from '@/components/admin/AdminTicketView';
import { rpc } from '@/lib/supabase/rpc';

export const metadata: Metadata = {
  title: 'تذكرة دعم — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminTicketPage({ params }: PageProps<'/admin/support/[id]'>) {
  await requirePlatformAccess('support', 'view');
  const { id } = await params;

  const res = await loadAdminTicket(id);
  if (!res.ok) notFound();

  const actor = await getActor();
  const canEdit = actor.kind === 'user' && adminHasLevel(actor, 'support', 'edit');

  // قائمة الإسناد تُقرأ فقط لمن يملك التعديل — الدالة نفسها تفحص ذلك
  let assignees: { member_id: string; display_name: string }[] = [];
  if (canEdit) {
    const supabase = await createClient();
    const { data } = await rpc(supabase, 'assignable_admins', {});
    assignees = data ?? [];
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/support"
            className="inline-flex items-center gap-1 text-sm font-bold text-nile-600
                       hover:underline">
        <ArrowRight size={15} className="flip-rtl" />
        العودة إلى الطابور
      </Link>

      <AdminTicketView ticket={res.data} canEdit={canEdit} assignees={assignees} />
    </div>
  );
}
