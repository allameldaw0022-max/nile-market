'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requirePlatformAccess } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { rpc, type AdminTicket } from '@/lib/supabase/rpc';

/**
 * مكتب الدعم من جانب الموظف.
 *
 * ★ الردّ يمرّ بـ`reply_to_ticket` نفسها التي يستخدمها العميل: هي من
 * تعرف أن الكاتب موظف فتضبط `author_kind` والحالة وتُنبّه الطرف
 * الآخر. مسار ثانٍ للموظفين كان سيفترق عنها بمرور الوقت.
 *
 * ★ الملاحظة الداخلية مسار مختلف تمامًا (`add_internal_note`) وتُخزَّن
 * في جدول لا تصله سياسات العميل بحال.
 */

const TICKET_STATUSES = [
  'new', 'open', 'in_progress', 'waiting_customer', 'waiting_internal',
  'resolved', 'closed',
] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export async function loadAdminTicket(
  ticketId: string,
): Promise<ActionResult<AdminTicket>> {
  try {
    await requirePlatformAccess('support', 'view');
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'support_ticket_admin', {
      p_ticket_id: ticketId,
    });
    if (error) throw fromPostgres(error);
    if (!data) throw errors.notFound();
    return ok(data);
  } catch (err) {
    return actionError(err);
  }
}

export async function replyAsStaff(input: {
  ticketId: string; body: string;
}): Promise<ActionResult> {
  try {
    await requirePlatformAccess('support', 'edit');
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'reply_to_ticket', {
      p_ticket_id: input.ticketId, p_body: input.body,
    });
    if (error) throw fromPostgres(error);

    revalidatePath(`/admin/support/${input.ticketId}`);
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

export async function addInternalNote(input: {
  ticketId: string; body: string;
}): Promise<ActionResult> {
  try {
    await requirePlatformAccess('support', 'edit');
    if (!input.body.trim()) throw errors.validation('الملاحظة فارغة', 'body');

    const supabase = await createClient();
    const { error } = await rpc(supabase, 'add_internal_note', {
      p_ticket_id: input.ticketId, p_body: input.body,
    });
    if (error) throw fromPostgres(error);

    revalidatePath(`/admin/support/${input.ticketId}`);
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

export async function changeTicketStatus(input: {
  ticketId: string; status?: string; priority?: string;
}): Promise<ActionResult> {
  try {
    await requirePlatformAccess('support', 'edit');
    if (input.status && !TICKET_STATUSES.includes(
          input.status as (typeof TICKET_STATUSES)[number]))
      throw errors.validation('حالة غير معروفة', 'status');
    if (input.priority && !PRIORITIES.includes(
          input.priority as (typeof PRIORITIES)[number]))
      throw errors.validation('أولوية غير معروفة', 'priority');

    const supabase = await createClient();
    const { error } = await rpc(supabase, 'set_ticket_status', {
      p_ticket_id: input.ticketId,
      // القاعدة تتجاهل null وتغيّر ما مُرِّر فقط
      p_status: input.status ?? null,
      p_priority: input.priority ?? null,
    });
    if (error) throw fromPostgres(error);

    revalidatePath(`/admin/support/${input.ticketId}`);
    revalidatePath('/admin/support');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

export async function assignTicket(input: {
  ticketId: string; memberId: string | null;
}): Promise<ActionResult> {
  try {
    await requirePlatformAccess('support', 'edit');
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'assign_ticket', {
      p_ticket_id: input.ticketId, p_member_id: input.memberId,
    });
    if (error) throw fromPostgres(error);

    revalidatePath(`/admin/support/${input.ticketId}`);
    revalidatePath('/admin/support');
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}
