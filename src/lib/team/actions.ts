'use server';
import 'server-only';
import { updateTag } from 'next/cache';
import { requireStoreAccess, requireUser } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { storeTag } from '@/lib/tenant/resolve';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { config } from '@/lib/config';

export type StoreRole = 'owner' | 'manager' | 'orders' | 'products' | 'customer_service';

export type TeamMember = {
  memberId: string;
  profileId: string;
  fullName: string | null;
  role: StoreRole;
  status: string;
  acceptedAt: string | null;
};

export type PendingInvitation = {
  id: string; email: string; role: StoreRole; expiresAt: string; createdAt: string;
};

const ASSIGNABLE: StoreRole[] = ['manager', 'orders', 'products', 'customer_service'];

export async function listTeam(storeId: string): Promise<ActionResult<{
  members: TeamMember[]; invitations: PendingInvitation[];
}>> {
  try {
    const { membership } = await requireStoreAccess(storeId, 'members:view');
    const supabase = await createClient();

    // الأسماء من `store_team`: سياسات profiles لا تكشف صف زميل
    const [{ data: members, error: membersError }, { data: team },
           { data: invitations }] = await Promise.all([
      supabase.from('store_members')
        .select('id, profile_id, role, status, accepted_at')
        .eq('store_id', membership.storeId).is('deleted_at', null)
        .order('created_at'),
      supabase.from('store_team').select('profile_id, full_name')
        .eq('store_id', membership.storeId),
      supabase.from('store_invitations')
        .select('id, email, role, expires_at, created_at')
        .eq('store_id', membership.storeId).is('accepted_at', null)
        .order('created_at', { ascending: false }),
    ]);
    if (membersError) throw fromPostgres(membersError);

    const nameOf = new Map((team ?? []).map((m) => [m.profile_id, m.full_name] as const));

    return ok({
      members: (members ?? []).map((m) => ({
        memberId: m.id,
        profileId: m.profile_id,
        fullName: nameOf.get(m.profile_id) ?? null,
        role: m.role as StoreRole,
        status: m.status,
        acceptedAt: m.accepted_at,
      })),
      invitations: (invitations ?? []).map((i) => ({
        id: i.id, email: i.email, role: i.role as StoreRole,
        expiresAt: i.expires_at, createdAt: i.created_at,
      })),
    });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * دعوة موظف.
 *
 * التوكن الخام يعود مرة واحدة فقط — القاعدة تخزّن تجزئته. الرابط
 * يُبنى هنا ويُعرض للتاجر لإرساله، ريثما يُربط إرسال البريد.
 */
export async function inviteMember(input: {
  storeId: string; email: string; role: StoreRole;
}): Promise<ActionResult<{ inviteUrl: string; expiresAt: string }>> {
  try {
    if (!ASSIGNABLE.includes(input.role))
      throw errors.validation('دور غير صالح للدعوة', 'role');

    const { membership } = await requireStoreAccess(input.storeId, 'members:manage');
    const supabase = await createClient();

    const { data, error } = await rpc(supabase, 'invite_store_member', {
      p_store_id: membership.storeId,
      p_email: input.email,
      p_role: input.role,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    updateTag(storeTag(membership.storeId, 'team'));
    return ok({
      inviteUrl: `${config.siteUrl}/invite/${row.token}`,
      expiresAt: row.expires_at,
    });
  } catch (err) {
    return actionError(err);
  }
}

export async function revokeInvitation(input: {
  storeId: string; invitationId: string;
}): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'members:manage');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('store_invitations').delete()
      .eq('id', input.invitationId).eq('store_id', membership.storeId)
      .is('accepted_at', null)
      .select('id');
    if (error) throw fromPostgres(error);
    if (!data || data.length === 0) throw errors.notFound();

    updateTag(storeTag(membership.storeId, 'team'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

export async function changeMemberRole(input: {
  storeId: string; memberId: string; role: StoreRole;
}): Promise<ActionResult> {
  try {
    if (!ASSIGNABLE.includes(input.role))
      throw errors.validation('دور غير صالح');

    const { membership } = await requireStoreAccess(input.storeId, 'members:manage');
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'set_store_member_role', {
      p_member_id: input.memberId, p_role: input.role,
    });
    if (error) throw fromPostgres(error);

    updateTag(storeTag(membership.storeId, 'team'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

export async function removeMember(input: {
  storeId: string; memberId: string;
}): Promise<ActionResult> {
  try {
    const { membership } = await requireStoreAccess(input.storeId, 'members:manage');
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'remove_store_member', {
      p_member_id: input.memberId,
    });
    if (error) throw fromPostgres(error);

    updateTag(storeTag(membership.storeId, 'team'));
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/** قبول دعوة — يُربط الحساب المسجَّل دخوله بالمتجر. */
export async function acceptInvitation(
  token: string,
): Promise<ActionResult<{ storeId: string; role: StoreRole }>> {
  try {
    await requireUser();
    if (!token || token.length < 16) throw errors.validation('رابط دعوة غير صالح');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'accept_store_invitation', {
      p_token: token,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    updateTag(storeTag(row.store_id, 'team'));
    return ok({ storeId: row.store_id, role: row.role as StoreRole });
  } catch (err) {
    return actionError(err);
  }
}
