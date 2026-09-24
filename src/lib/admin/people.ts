'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { ADMIN_SECTIONS, type AdminSection } from '@/lib/authz/permissions';
import { normalizePhone } from '@/lib/phone';

/**
 * أفعال الأشخاص في لوحة الإدارة: الموظفون · المستخدمون · الشركاء.
 *
 * ★ كل فعل يمرّ بـ`requirePlatformAccess` (يفرض MFA)، ثم تعيد دالة
 * القاعدة الفحص من جديد. حدود مثل «لا تقلّ حسابات الإدارة عن اثنين»
 * (D29) و«نسبة العمولة لـcommissions:manage» تعيش في القاعدة، فلا
 * تسقط بسقوط هذا الملف.
 */

const LEVELS = ['none', 'view', 'create', 'edit', 'delete', 'approve', 'manage'];

export async function saveAdminMember(input: {
  profileId: string; displayName: string; isOwner: boolean;
  permissions: Record<string, string>;
}): Promise<ActionResult<{ memberId: string }>> {
  try {
    await requirePlatformAccess('settings', 'manage');

    // قائمة بيضاء صريحة: قسم أو مستوى غير معروف لا يصل القاعدة أصلًا
    const clean: Record<string, string> = {};
    for (const [section, level] of Object.entries(input.permissions)) {
      if (!ADMIN_SECTIONS.includes(section as AdminSection)) continue;
      if (!LEVELS.includes(level)) continue;
      if (level === 'none') continue;
      clean[section] = level;
    }

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'upsert_admin_member', {
      p_profile_id: input.profileId,
      p_display_name: input.displayName.trim(),
      p_is_owner: input.isOwner,
      p_permissions: clean,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/employees');
    return ok({ memberId: String(data) });
  } catch (err) {
    return actionError(err);
  }
}

export async function suspendAdminMember(memberId: string): Promise<ActionResult> {
  try {
    await requirePlatformAccess('settings', 'manage');
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'suspend_admin_member', {
      p_member_id: memberId,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/employees');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/** بحث عن حساب لترقيته موظفًا — بالبريد أو الاسم. */
export async function findAccount(term: string): Promise<ActionResult<{
  profileId: string; name: string | null; email: string | null;
}[]>> {
  try {
    await requirePlatformAccess('settings', 'manage');
    if (term.trim().length < 3)
      throw errors.validation('اكتب ثلاثة أحرف على الأقل', 'term');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'platform_users', {
      p_search: term.trim(), p_limit: 10,
    });
    if (error) throw fromPostgres(error);

    return ok((data ?? []).map((u) => ({
      profileId: u.profile_id, name: u.full_name, email: u.email,
    })));
  } catch (err) {
    return actionError(err);
  }
}

export async function setAccountStatus(input: {
  profileId: string; status: 'active' | 'suspended' | 'closed'; reason?: string;
}): Promise<ActionResult> {
  try {
    await requirePlatformAccess('users', 'manage');
    if (input.status !== 'active' && !input.reason?.trim())
      throw errors.validation('السبب إلزامي', 'reason');

    const supabase = await createClient();
    const { error } = await rpc(supabase, 'set_account_status', {
      p_profile_id: input.profileId,
      p_status: input.status,
      p_reason: input.reason?.trim() || null,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/users');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/**
 * دعوة شريك.
 * ★ التوكن يعود مرّة واحدة ولا يُحفظ عندنا: تُسلَّم للشريك الآن أو
 * تُعاد الدعوة. القاعدة تخزّن بصمته فقط.
 */
export async function invitePartner(input: {
  name: string; email: string; phone?: string;
}): Promise<ActionResult<{ partnerId: string; referralCode: string; link: string }>> {
  try {
    await requirePlatformAccess('partners', 'edit');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'invite_partner', {
      p_name: input.name.trim(),
      p_email: input.email.trim(),
      p_phone: normalizePhone(input.phone),
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    revalidatePath('/admin/partners');
    return ok({
      partnerId: row.partner_id,
      referralCode: row.referral_code,
      link: `/partner/join/${row.token}`,
    });
  } catch (err) {
    return actionError(err);
  }
}

export async function setPartnerStatus(input: {
  partnerId: string; status: 'active' | 'suspended';
}): Promise<ActionResult> {
  try {
    await requirePlatformAccess('partners', 'edit');
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'set_partner_status', {
      p_partner_id: input.partnerId, p_status: input.status,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/partners');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/** نسبة عمولة الشريك — القاعدة تشترط `commissions:manage` (حارس 0010). */
export async function setPartnerRate(input: {
  partnerId: string; rate: number;
}): Promise<ActionResult> {
  try {
    await requirePlatformAccess('commissions', 'manage');
    if (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > 100)
      throw errors.validation('النسبة بين 0 و100', 'rate');

    const supabase = await createClient();
    const { error } = await rpc(supabase, 'set_partner_rate', {
      p_partner_id: input.partnerId, p_rate: input.rate,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/partners');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

/** قبول دعوة الشراكة — يناديه صاحب الرابط بحسابه. */
export async function acceptPartnerInvitation(token: string): Promise<
  ActionResult<{ name: string; referralCode: string }>
> {
  try {
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'accept_partner_invitation', {
      p_token: token,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    return ok({ name: row.name, referralCode: row.referral_code });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * تعيين مستخدم قائم مسوّقًا (Marketing Partner).
 *
 * ★ التخويل خادمي مرتين: الحارس هنا، وفحص `partners:edit` داخل
 * `assign_marketing_partner` نفسها. إخفاء الزر ليس حاجزًا.
 *
 * ★ لا نسبة ولا كود يُرسلان من المتصفح: القاعدة تقرأ النسبة من
 * إعدادات المنصة (30%) وتولّد الكود وتتحقق من تفرّده.
 */
export async function assignMarketingPartner(
  profileId: string,
): Promise<ActionResult<{ partnerId: string; referralCode: string;
                         created: boolean }>> {
  try {
    await requirePlatformAccess('partners', 'edit');
    const supabase = await createClient();

    const { data, error } = await rpc(supabase, 'assign_marketing_partner', {
      p_profile_id: profileId,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    revalidatePath('/admin/users');
    revalidatePath('/admin/partners');
    return ok({
      partnerId: row.partner_id,
      referralCode: row.referral_code,
      created: row.was_created,
    });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * إزالة المستخدم من دور المسوّق.
 * إيقاف لا حذف: الإحالات والعمولات المقيَّدة عمل ماضٍ مستحَق،
 * والقاعدة ترفض حذفها أصلًا (`app.protect_referral`).
 */
export async function revokeMarketingPartner(
  profileId: string,
): Promise<ActionResult> {
  try {
    await requirePlatformAccess('partners', 'edit');
    const supabase = await createClient();

    const { error } = await rpc(supabase, 'revoke_marketing_partner', {
      p_profile_id: profileId,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/admin/users');
    revalidatePath('/admin/partners');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}
