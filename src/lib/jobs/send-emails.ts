import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { rpc } from '@/lib/supabase/rpc';
import { config } from '@/lib/config';
import { renderEmail } from '@/lib/email/templates';

/**
 * تفريغ صندوق البريد عبر Resend.
 *
 * ★ لماذا صندوق ووظيفة خلفية بدل إرسال مباشر؟
 *  - لا نداء شبكة داخل معاملة قاعدة البيانات: مزوّد بطيء كان سيقفل
 *    صفًا في `orders` طوال انتظاره.
 *  - الطلب ينجح حتى لو تعطّل المزوّد؛ البريد يبقى في الصندوق ويُعاد.
 *  - إعادة المحاولة بتراجع أسّي في القاعدة، وسقف 5 محاولات يمنع
 *    حلقة أبدية.
 *
 * ★ المفتاح سرّ خادمي: `claim_emails` وتوابعها ممنوحة لـservice_role
 * وحده، ولا مسار من المتصفح إلى هنا إطلاقًا.
 *
 * المزوّد خلف دالة واحدة (`deliver`) — تغييره لا يمسّ بقية النظام
 * (تفضيل «مزوّد قابل للاستبدال»).
 */

export type DrainResult = {
  claimed: number; sent: number; failed: number; skipped: number;
};

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

async function deliver(input: {
  to: string; subject: string; html: string; text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    return { ok: false, error: 'RESEND_API_KEY أو EMAIL_FROM غير مضبوط' };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      // مهلة صريحة: عامل عالق على مزوّد لا يستجيب يعطّل بقية الصندوق
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'فشل غير معروف' };
  }
}

export async function drainEmailOutbox(limit = 20): Promise<DrainResult> {
  const supabase = createServiceClient();
  const result: DrainResult = { claimed: 0, sent: 0, failed: 0, skipped: 0 };

  const { data, error } = await rpc(supabase, 'claim_emails', { p_limit: limit });
  if (error) {
    console.error('[email] تعذّر سحب البريد', error.message);
    return result;
  }

  for (const row of data ?? []) {
    result.claimed += 1;

    const rendered = renderEmail(row.template, row.payload, {
      siteName: config.siteName,
      siteUrl: config.siteUrl,
    });

    if (!rendered) {
      // قالب غير معروف: لا يُعاد إلى الطابور — إعادته بلا فائدة
      result.skipped += 1;
      await rpc(supabase, 'mark_email_failed', {
        p_id: row.id, p_error: `قالب غير معروف: ${row.template}`,
      });
      continue;
    }

    const outcome = await deliver({ to: row.to_email, ...rendered });
    if (outcome.ok) {
      result.sent += 1;
      await rpc(supabase, 'mark_email_sent', { p_id: row.id });
    } else {
      result.failed += 1;
      await rpc(supabase, 'mark_email_failed', {
        p_id: row.id, p_error: outcome.error,
      });
    }
  }

  return result;
}
