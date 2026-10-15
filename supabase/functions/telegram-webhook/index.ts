/**
 * بوت تلغرام لصاحب المنصّة: يراجع مسوّدة المساعد فيرسلها أو يمنعها.
 *
 * الطلب: POST من تلغرام، بترويسة `X-Telegram-Bot-Api-Secret-Token`
 * التي يضعها تلغرام نفسه (تُضبَط عند `setWebhook`).
 *
 * ★★★ ثلاثة جدران لا جدار: (١) السرّ في الترويسة، (٢) أن تكون
 * المحادثة **والضاغط** هما صاحب المنصّة بعينه، (٣) أن يكون الفعل
 * واحدًا من اثنين ومعرّفه UUID. فلو سُرّب السرّ بقي الجداران.
 *
 * ★★★ وكل جوابٍ 200 — ولو تجاهلنا التحديث أو فشل شيء. تلغرام يُعيد
 * المحاولة على أي جواب غير ناجح، ويُعطّل الـwebhook إن تكرّر الفشل.
 * فالفشل يُسجَّل ويُقال لصاحب المنصّة في المحادثة، ولا يُعلَن لتلغرام.
 *
 * ★★ والمطالبة الذرّية كما في `support-agent`: ضغطتان على «أرسل»
 * (إصبعٌ مرتعش، أو شبكةٌ أعادت التحديث) تُنتجان ردّين للتاجر. فالصفّ
 * يُنقل `pending ⟶ sent` **بشرط** أنه `pending`، وصفر صفوفٍ معناه
 * «بُتَّ فيها سابقًا».
 *
 * ★ ولماذا النقل قبل الإرسال لا بعده: لو أُرسل أوّلًا ثم سقط التحديث
 *   لبقي الصفّ `pending` فيُرسل ثانيةً. والعكس (يقول `sent` ثم يفشل
 *   النداء) يُصحّح نفسه: الفشل يُكتب `failed` مع نصّه.
 */

import { requireEnv } from '../_shared/env.ts';
import { jsonResponse, requireSecret } from '../_shared/http.ts';
import { restClient } from '../_shared/db.ts';
import {
  type TelegramEvent,
  parseUpdate,
} from '../_shared/telegram-update.ts';
import { answerCallback, clearKeyboard, sendMessage, telegramConfig } from '../_shared/telegram.ts';

type LogRow = {
  id: string;
  ticket_id: string;
  draft_reply: string | null;
  status: string;
};

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    // ★★ يُسجَّل ويُردّ بـ200: تلغرام لا يُفيده علمُه بفشلنا، وإعادته
    //    المحاولة تكرّر الفشل نفسه. ورمز الارتباط في السجلّ (قاعدة ٨).
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(JSON.stringify({
      event: 'telegram_webhook_failed',
      reference,
      message: error instanceof Error ? error.message : String(error),
    }));
    return jsonResponse({ ok: true, error: 'HANDLED', reference });
  }
});

const ignored = (reason: string) => jsonResponse({ ok: true, ignored: reason });

async function handle(request: Request): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  // ★ الترويسة باسم تلغرام الرسميّ — هو من يضعها، لا نحن.
  const denied = await requireSecret(
    request,
    'x-telegram-bot-api-secret-token',
    requireEnv('TELEGRAM_WEBHOOK_SECRET'),
  );
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ignored('جسم غير صالح');
  }

  const config = telegramConfig();
  const event: TelegramEvent = parseUpdate(body, config.ownerChatId);

  if (event.kind === 'ignore') return ignored(event.reason);

  if (event.kind === 'command') {
    const help = [
      '<b>مساعد دعم سوق النيل</b>',
      'تصلك هنا مسوّدات الردود والتذاكر التي تحتاجك.',
      '• <b>أرسل للتاجر</b> — يُرسل المسوّدة كما هي ردًّا على التذكرة.',
      '• <b>لا ترسل</b> — تُسجَّل مرفوضة، ولا يصل التاجر شيء.',
      'ولا يردّ المساعد تلقائيًّا إلا إن ضُبط <code>AI_MODE=auto</code>.',
    ].join('\n');
    await sendMessage(help, { config });
    return jsonResponse({ ok: true, handled: 'command' });
  }

  const rest = restClient();

  if (event.action === 'skip') {
    const declined = await rest.patch<LogRow>(
      'support_ai_logs',
      `id=eq.${event.logId}&status=eq.pending&select=id`,
      { status: 'declined', reason: 'منعها صاحب المنصّة', updated_at: new Date().toISOString() },
    );
    await answerCallback(
      event.callbackId,
      declined.length ? 'لن تُرسل.' : 'بُتَّ في هذه سابقًا.',
      config,
    );
    await clearKeyboard(event.chatId, event.messageId, config);
    return jsonResponse({ ok: true, handled: 'skip', changed: declined.length > 0 });
  }

  // ═══ «أرسل»: مطالبة ذرّية ثم إرسال ═══
  const claimed = await rest.patch<LogRow>(
    'support_ai_logs',
    `id=eq.${event.logId}&status=eq.pending&select=id,ticket_id,draft_reply,status`,
    { status: 'sent', action: 'reply', updated_at: new Date().toISOString() },
  );
  if (!claimed.length) {
    await answerCallback(event.callbackId, 'بُتَّ في هذه سابقًا.', config);
    await clearKeyboard(event.chatId, event.messageId, config);
    return jsonResponse({ ok: true, handled: 'send', changed: false });
  }

  const log = claimed[0];
  const draft = (log.draft_reply ?? '').trim();
  if (!draft) {
    // ★ مسوّدة فارغة لا تُرسل: لا نُظهر للتاجر رسالةً بيضاء. والصفّ
    //   يُعاد إلى `failed` لا إلى `pending`، فلا تدور الضغطة أبدًا.
    await rest.patch('support_ai_logs', `id=eq.${log.id}`, {
      status: 'failed', error: 'EMPTY_DRAFT', updated_at: new Date().toISOString(),
    });
    await answerCallback(event.callbackId, 'المسوّدة فارغة — لم تُرسل.', config);
    return jsonResponse({ ok: true, handled: 'send', changed: false, error: 'EMPTY_DRAFT' });
  }

  try {
    // ★ بلا ذيل الإفصاح: صاحب المنصّة قرأ المسوّدة وأرسلها، فالكلام
    //   كلامه — والإفصاح لوضع `auto` الذي لا يقرأه أحد.
    const sent = await rest.rpc<{ message_id: string; status_changed: boolean }[]>(
      'ai_support_reply',
      { p_ticket_id: log.ticket_id, p_body: draft },
    );
    const statusChanged = sent?.[0]?.status_changed === true;
    if (!statusChanged) {
      await rest.patch('support_ai_logs', `id=eq.${log.id}`, {
        error: 'STATUS_NOT_CHANGED', updated_at: new Date().toISOString(),
      });
    }
    await answerCallback(event.callbackId, 'أُرسلت للتاجر.', config);
    await clearKeyboard(event.chatId, event.messageId, config);
    return jsonResponse({ ok: true, handled: 'send', changed: true, statusChanged });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await rest.patch('support_ai_logs', `id=eq.${log.id}`, {
      status: 'failed', error: message.slice(0, 500), updated_at: new Date().toISOString(),
    });
    // ★★ صاحب المنصّة يُخبَر في نفس المحادثة: فشلٌ لا يراه من ضغط
    //    الزرّ يجعله يظنّ التاجر مردودًا عليه وهو لم يُردّ.
    await answerCallback(event.callbackId, 'فشل الإرسال — راجع السجلّ.', config);
    await sendMessage(
      `<b>فشل إرسال مسوّدة</b>\n<code>${message.slice(0, 200)}</code>`,
      { config },
    );
    return jsonResponse({ ok: true, handled: 'send', changed: false, error: 'SEND_FAILED' });
  }
}
