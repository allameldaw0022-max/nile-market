import type { Metadata } from 'next';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { getActor } from '@/lib/auth/actor';
import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/States';
import { rpc } from '@/lib/supabase/rpc';
import { AccessMatrix } from '@/components/admin/AccessMatrix';

export const metadata: Metadata = {
  title: 'الموظفون — الإدارة',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * موظفو المنصة ومصفوفة الوصول.
 *
 * ★ الصفحة تعرض الصورة كاملة في جدول واحد: مراجعة الصلاحيات دوريًا
 * تحتاج المقارنة بين الموظفين، لا صفحة لكل واحد.
 *
 * ★ كل ما يظهر هنا قابل للقراءة فقط ما لم يملك الموظف `settings:manage`
 * — والقاعدة تعيد الفحص، فالإخفاء تحسين تجربة لا حاجز.
 */
export default async function AdminEmployeesPage() {
  await requirePlatformAccess('settings', 'view');
  const actor = await getActor();
  const canManage = actor.kind === 'user'
    && (actor.admin?.isOwner || actor.admin?.permissions.get('settings') === 'manage');

  const supabase = await createClient();
  const { data, error } = await rpc(supabase, 'admin_access_matrix', {});
  if (error) return <ErrorState description="تعذّر تحميل مصفوفة الصلاحيات" />;

  const rows = (data ?? []).map((m) => ({
    memberId: m.member_id,
    profileId: m.profile_id,
    displayName: m.display_name,
    isOwner: m.is_owner,
    status: m.status,
    mfaRequired: m.mfa_required,
    lastActiveAt: m.last_active_at,
    permissions: m.permissions ?? {},
    isMe: actor.kind === 'user' && m.profile_id === actor.userId,
  }));

  const active = rows.filter((r) => r.status === 'active').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900">موظفو المنصة</h1>
        <p className="text-sm text-ink-500">
          فصل المهام (D29) يشترط بقاء حسابَي إدارة نشطَين على الأقل —
          حاليًا {active}. القاعدة ترفض الإيقاف الذي ينزل بالعدد دونهما.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="مصفوفة الوصول"
          description="كل موظف وما يراه في كل قسم. التعديل يستبدل الصلاحيات بالكامل."
        />
        <AccessMatrix members={rows} canManage={Boolean(canManage)} />
      </Card>
    </div>
  );
}
