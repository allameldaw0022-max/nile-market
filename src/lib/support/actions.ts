'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { firstRow, rpc } from '@/lib/supabase/rpc';
import { TICKET_CATEGORIES } from './categories';

/**
 * تذاكر الدعم من جانب صاحب التذكرة.
 *
 * ★ عزل: RLS تُرجع للمستخدم تذاكره وحدها (ولفريق المتجر تذاكر متجره
 * إن كان يملك `support:manage`). هذه الاستعلامات لا تُمرّر معرّف
 * مستخدم إطلاقًا — الترشيح في القاعدة لا في الواجهة.
 *
 * ★ الملاحظات الداخلية (`support_internal_notes`) في جدول منفصل ولا
 * تُقرأ هنا بحال.
 */

export type TicketSummary = {
  id: string; ticketNumber: string; subject: string;
  category: string; status: string; priority: string;
  lastMessageAt: string; createdAt: string;
};

export type TicketMessage = {
  id: string; authorKind: string; body: string; createdAt: string;
  isMine: boolean;
};

export type TicketDetail = TicketSummary & {
  messages: TicketMessage[];
  isRequester: boolean;
};

export async function listMyTickets(): Promise<ActionResult<TicketSummary[]>> {
  try {
    await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('support_tickets')
      .select('id, ticket_number, subject, category, status, priority, last_message_at, created_at')
      .order('last_message_at', { ascending: false })
      .limit(50);
    if (error) throw fromPostgres(error);

    return ok((data ?? []).map((t) => ({
      id: t.id, ticketNumber: t.ticket_number, subject: t.subject,
      category: t.category, status: t.status, priority: t.priority,
      lastMessageAt: t.last_message_at, createdAt: t.created_at,
    })));
  } catch (err) {
    return actionError(err);
  }
}

export async function loadTicket(ticketId: string): Promise<ActionResult<TicketDetail>> {
  try {
    const actor = await requireUser();
    const supabase = await createClient();

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .select('id, ticket_number, subject, category, status, priority, last_message_at, created_at, requester_id')
      .eq('id', ticketId).maybeSingle();
    if (error) throw fromPostgres(error);
    // تذكرة غيره ⇒ RLS ترشّحها ⇒ 404 لا 403
    if (!ticket) throw errors.notFound();

    const { data: messages } = await supabase
      .from('support_messages')
      .select('id, author_kind, body, created_at, author_id')
      .eq('ticket_id', ticketId).order('created_at');

    return ok({
      id: ticket.id,
      ticketNumber: ticket.ticket_number,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
      lastMessageAt: ticket.last_message_at,
      createdAt: ticket.created_at,
      isRequester: ticket.requester_id === actor.userId,
      messages: (messages ?? []).map((m) => ({
        id: m.id, authorKind: m.author_kind, body: m.body,
        createdAt: m.created_at, isMine: m.author_id === actor.userId,
      })),
    });
  } catch (err) {
    return actionError(err);
  }
}

export async function createTicket(input: {
  subject: string; category: string; body: string; storeId?: string | null;
}): Promise<ActionResult<{ ticketId: string; ticketNumber: string }>> {
  try {
    await requireUser();
    if (!TICKET_CATEGORIES.some((c) => c.value === input.category))
      throw errors.validation('اختر تصنيفًا صحيحًا', 'category');

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'create_support_ticket', {
      p_subject: input.subject,
      p_category: input.category,
      p_body: input.body,
      p_store_id: input.storeId ?? null,
    });
    if (error) throw fromPostgres(error);
    const row = firstRow(data);
    if (!row) throw errors.internal();

    revalidatePath('/support');
    return ok({ ticketId: row.ticket_id, ticketNumber: row.ticket_number });
  } catch (err) {
    return actionError(err);
  }
}

export async function replyToTicket(input: {
  ticketId: string; body: string;
}): Promise<ActionResult> {
  try {
    await requireUser();
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'reply_to_ticket', {
      p_ticket_id: input.ticketId, p_body: input.body,
    });
    if (error) throw fromPostgres(error);

    revalidatePath(`/support/${input.ticketId}`);
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

export async function closeTicket(ticketId: string): Promise<ActionResult> {
  try {
    await requireUser();
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'close_my_ticket', { p_ticket_id: ticketId });
    if (error) throw fromPostgres(error);

    revalidatePath(`/support/${ticketId}`);
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}
