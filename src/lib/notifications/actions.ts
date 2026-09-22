'use server';
import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/authz/guards';
import { createClient } from '@/lib/supabase/server';
import { fromPostgres } from '@/lib/authz/errors';
import { actionError, ok, type ActionResult } from '@/lib/action-result';
import { rpc } from '@/lib/supabase/rpc';

/**
 * التنبيهات.
 *
 * ★ الصندوق يخص صاحبه: RLS تُرجع صفوف `user_id = auth.uid()` وحدها،
 * والكتابة ممنوعة على كل الأدوار — التنبيه يُنشئه النظام عبر دوال
 * `app.notify` لا المستخدم.
 */

export type NotificationRow = {
  id: string; type: string; title: string; body: string | null;
  link: string | null; readAt: string | null; createdAt: string;
};

export async function listNotifications(limit = 20): Promise<ActionResult<{
  items: NotificationRow[]; unread: number;
}>> {
  try {
    await requireUser();
    const supabase = await createClient();

    const [{ data, error }, { count }] = await Promise.all([
      supabase.from('notifications')
        .select('id, type, title, body, link, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 50)),
      supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null),
    ]);
    if (error) throw fromPostgres(error);

    return ok({
      items: (data ?? []).map((n) => ({
        id: n.id, type: n.type, title: n.title, body: n.body,
        link: n.link, readAt: n.read_at, createdAt: n.created_at,
      })),
      unread: count ?? 0,
    });
  } catch (err) {
    return actionError(err);
  }
}

export async function markNotificationsRead(
  ids?: string[],
): Promise<ActionResult<{ marked: number }>> {
  try {
    await requireUser();
    const supabase = await createClient();
    const { data, error } = await rpc(supabase, 'mark_notifications_read', {
      p_ids: ids && ids.length > 0 ? ids : null,
    });
    if (error) throw fromPostgres(error);

    revalidatePath('/dashboard');
    return ok({ marked: Number(data ?? 0) });
  } catch (err) {
    return actionError(err);
  }
}
