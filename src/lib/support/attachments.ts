'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/authz/guards';
import { errors, fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { firstRow, rpc } from '@/lib/supabase/rpc';

/**
 * مرفقات تذاكر الدعم.
 *
 * ★ نفس نمط الرفع على مرحلتين المعتمد في `lib/media/actions.ts`:
 * القاعدة تتحقّق وتولّد المسار، ثم يرفع المتصفّح مباشرةً إلى
 * Storage خاضعًا لسياسات `storage.objects`، ثم يُربط الملف.
 * الملف لا يمرّ بالخادم ⇒ لا حدّ 4.5MB على Server Action.
 *
 * ★ الفحص خادمي بالكامل ولا يُعتمد على الواجهة: النوع والحجم من
 * إعداد الدلو نفسه، والملكيّة من `support_tickets`، والمسار يُولَّد
 * في القاعدة. الواجهة تفحص مبكّرًا لتعطي رسالة واضحة فقط.
 *
 * ★ الدلو خاصّ: القراءة بروابط موقّعة قصيرة العمر، ولا رابط عامّ
 * لأي مرفق مهما كان.
 */

/** الأنواع المسموحة — مطابقة لإعداد الدلو في 0015. */
const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
] as const;

/** 10MB — نفس حدّ الدلو. */
const MAX_BYTES = 10 * 1024 * 1024;

export type AttachmentTicket = { mediaId: string; bucket: string; path: string };

export type TicketAttachment = {
  id: string; messageId: string | null; mediaId: string;
  mime: string; size: number; createdAt: string;
};

export async function beginAttachmentUpload(input: {
  ticketId: string; mime: string; size: number;
}): Promise<ActionResult<AttachmentTicket>> {
  try {
    await requireUser();

    // فحص مبكر لرسالة واضحة — القاعدة تعيد الفحص وهي الحاجز
    if (!(ALLOWED_MIME as readonly string[]).includes(input.mime)) {
      throw errors.validation('نوع الملف غير مدعوم — الصور وPDF والنصّ فقط');
    }
    if (!Number.isFinite(input.size) || input.size <= 0) {
      throw errors.validation('ملف فارغ');
    }
    if (input.size > MAX_BYTES) {
      throw errors.validation('حجم الملف يتجاوز ١٠ ميجابايت');
    }

    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'prepare_support_upload', {
      p_ticket_id: input.ticketId,
      p_mime: input.mime,
      p_size: Math.round(input.size),
    });
    if (error) throw fromPostgres(error);

    const row = firstRow(data);
    if (!row) throw errors.internal();
    return ok({ mediaId: row.media_id, bucket: row.bucket, path: row.path });
  } catch (err) {
    return actionError(err);
  }
}

/** يربط الملف المرفوع بالتذكرة بعد نجاح الرفع. */
export async function completeAttachmentUpload(input: {
  ticketId: string; mediaId: string; messageId?: string | null;
}): Promise<ActionResult> {
  try {
    await requireUser();
    const supabase = await createClient();
    const { error } = await rpc(supabase, 'attach_to_ticket', {
      p_ticket_id: input.ticketId,
      p_media_id: input.mediaId,
      p_message_id: input.messageId ?? null,
    });
    if (error) throw fromPostgres(error);

    revalidatePath(`/support/${input.ticketId}`);
    return ok(undefined);
  } catch (err) {
    return actionError(err);
  }
}

export async function listTicketAttachments(
  ticketId: string,
): Promise<ActionResult<TicketAttachment[]>> {
  try {
    await requireUser();
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'ticket_attachments', {
      p_ticket_id: ticketId,
    });
    if (error) throw fromPostgres(error);

    return ok((data ?? []).map((r) => ({
      id: r.id,
      messageId: r.message_id,
      mediaId: r.media_id,
      mime: r.mime_type,
      size: r.size_bytes,
      createdAt: r.created_at,
    })));
  } catch (err) {
    return actionError(err);
  }
}

/**
 * رابط تنزيل موقَّع قصير العمر.
 *
 * ★ المسار لا يأتي من المتصفّح: يُقرأ من `ticket_attachments` التي
 * تخضع لـRLS على `support_attachments`. فمن لا يملك حقّ قراءة
 * المرفق لا يحصل على مساره أصلًا، فضلًا عن رابطه — ولا ينفع تخمين
 * معرّف الملف لأن الصفّ نفسه لا يُقرأ.
 *
 * ★ العمر دقيقتان: يكفي لفتح الملف ولا يصلح للمشاركة.
 */
export async function attachmentUrl(input: {
  ticketId: string; attachmentId: string;
}): Promise<ActionResult<{ url: string }>> {
  try {
    await requireUser();
    const supabase = await createClient();

    const { data, error } = await rpc(supabase, 'ticket_attachments', {
      p_ticket_id: input.ticketId,
    });
    if (error) throw fromPostgres(error);

    const row = (data ?? []).find((r) => r.id === input.attachmentId);
    if (!row) throw errors.notFound('المرفق غير متاح');

    const signed = await supabase.storage
      .from('support-attachments')
      .createSignedUrl(row.path, 120);

    if (signed.error || !signed.data?.signedUrl) {
      throw errors.internal('تعذّر إنشاء رابط التنزيل');
    }
    return ok({ url: signed.data.signedUrl });
  } catch (err) {
    return actionError(err);
  }
}
