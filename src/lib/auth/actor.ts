import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { AdminLevel, AdminSection, StorePermission, StoreRole } from '@/lib/authz/permissions';
import { levelRank } from '@/lib/authz/permissions';

export type StoreMembership = {
  storeId: string;
  storeName: string;
  storeSlug: string;
  role: StoreRole;
  permissions: Set<StorePermission>;
};

export type Actor =
  | { kind: 'anonymous' }
  | {
      kind: 'user';
      userId: string;
      email: string | null;
      fullName: string | null;
      accountStatus: 'active' | 'suspended' | 'closed';
      emailVerified: boolean;
      /** aal2 يعني أن المستخدم أكمل تحقق MFA في هذه الجلسة (D28). */
      aal: 'aal1' | 'aal2';
      stores: StoreMembership[];
      admin: { memberId: string; isOwner: boolean; mfaRequired: boolean;
               permissions: Map<AdminSection, AdminLevel> } | null;
      partnerId: string | null;
    };

/**
 * الفاعل الحالي — مصدر واحد للهوية والصلاحيات في كل الطلب.
 *
 * ★ يفشل **مغلقًا**: أي خطأ في تحميل البيانات يُعامَل كزائر مجهول
 * ويُسجَّل، ولا يُخمَّن دور افتراضي (إصلاح مباشر لثغرة S1 في الفحص،
 * حيث كان فشل القراءة يُصنِّف المستخدم كـcustomer بصمت).
 */
export const getActor = cache(async (): Promise<Actor> => {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { kind: 'anonymous' };

  const [profileRes, membersRes, adminRes, partnerRes] = await Promise.all([
    supabase.from('profiles')
      .select('full_name, account_status, email_verified_at')
      .eq('id', user.id).maybeSingle(),
    supabase.from('store_members')
      .select('store_id, role, permissions, stores(name, slug)')
      .eq('profile_id', user.id).eq('status', 'active').is('deleted_at', null),
    supabase.from('admin_members')
      .select('id, is_owner, mfa_required, admin_permissions(section, level)')
      .eq('profile_id', user.id).eq('status', 'active').maybeSingle(),
    supabase.from('partners')
      .select('id').eq('profile_id', user.id).eq('status', 'active').maybeSingle(),
  ]);

  // خطأ في قراءة البروفايل ≠ غياب البروفايل. الأول عطل، والثاني حالة
  // غير مشروعة. كلاهما يفشل مغلقًا، لكن يُسجَّلان بوضوح للتشخيص.
  if (profileRes.error) {
    console.error('[actor] فشل قراءة البروفايل', {
      userId: user.id, error: profileRes.error.message,
    });
    return { kind: 'anonymous' };
  }
  if (!profileRes.data) {
    console.error('[actor] مستخدم مصادَق بلا صف بروفايل', { userId: user.id });
    return { kind: 'anonymous' };
  }

  const profile = profileRes.data;

  const stores: StoreMembership[] = (membersRes.data ?? []).map((m) => {
    const store = m.stores as unknown as { name: string; slug: string } | null;
    return {
      storeId: m.store_id,
      storeName: store?.name ?? '',
      storeSlug: store?.slug ?? '',
      role: m.role as StoreRole,
      // الصلاحيات الفعلية تُحسم في القاعدة؛ هذه للواجهة فقط
      permissions: new Set((m.permissions ?? []) as StorePermission[]),
    };
  });

  const adminPermissions = new Map<AdminSection, AdminLevel>();
  if (adminRes.data) {
    for (const p of (adminRes.data.admin_permissions ?? []) as
         { section: AdminSection; level: AdminLevel }[]) {
      adminPermissions.set(p.section, p.level);
    }
  }

  const aal = (user as { aal?: string }).aal === 'aal2' ? 'aal2' : 'aal1';

  return {
    kind: 'user',
    userId: user.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    accountStatus: profile.account_status,
    emailVerified: Boolean(profile.email_verified_at),
    aal,
    stores,
    admin: adminRes.data
      ? {
          memberId: adminRes.data.id,
          isOwner: adminRes.data.is_owner,
          mfaRequired: adminRes.data.mfa_required,
          permissions: adminPermissions,
        }
      : null,
    partnerId: partnerRes.data?.id ?? null,
  };
});

export function adminHasLevel(
  actor: Actor, section: AdminSection, level: AdminLevel,
): boolean {
  if (actor.kind !== 'user' || !actor.admin) return false;
  if (actor.admin.isOwner) return true;
  const have = actor.admin.permissions.get(section) ?? 'none';
  return levelRank(have) >= levelRank(level);
}
