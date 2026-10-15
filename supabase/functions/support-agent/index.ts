/**
 * مساعد الدعم: يقرأ تذكرة تاجرٍ، يسترجع من قاعدة المعرفة، ثم يردّ
 * أو يُسوّد أو يحوّل إلى إنسان.
 *
 * الطلب: POST مع ترويسة `x-support-secret` وأحد شكلين:
 *   محفّز القاعدة: { type: "INSERT", table: "support_messages", record: { ticket_id } }
 *   نداء مباشر:    { ticketId: "<uuid>" }
 *
 * ★★★ المطالبة قبل العمل، لا بعده: أوّل ما يفعله المعالج بعد البوّابات
 * هو `insert ... on conflict do nothing` في `support_ai_logs`
 * (و`ticket_id` فريد). فإن عاد صفر صفوفٍ فالتذكرة مُطالَبٌ بها —
 * نتوقّف. ولو أُجّلت المطالبة إلى ما بعد النموذج لكان محفّزان متقاربان
 * (رسالتان من التاجر في ثانية) يُنتجان **ردّين** على تذكرة واحدة،
 * ويدفعان ثمن نموذجين. والقاعدة هي الحاكم لا الكود: الفرادة قيدٌ في
 * المخطّط (0071)، فتكرارٌ من مسارٍ آخر يسقط كذلك.
 *
 * ★★ وصفٌّ واحد لكل تذكرة **أبدًا** يعني: المساعد **مجيبٌ أوّل** لا
 * مشاركٌ في محادثة. دورٌ واحدٌ ثم التذكرة للبشر. وهذا قرارٌ لا قيدٌ
 * تقنيّ: ردٌّ آليٌّ ثانٍ على نفس التذكرة يناقض الأوّل أو يكرّره.
 *
 * ★★ والقاعدة ٥ من مواصفة المشروع محفوظة بالبناء لا بالنيّة: النفاذ
 * كلّه عبر `_shared/db.ts` وقائمتُه أربعة جداول `support_*` ودالّتان،
 * وحارسٌ في الاختبارات يمنع تسلّل غيرها. ولا يُقرأ من التذكرة عمودٌ
 * ماليّ ولا `related_payment_id` — ما لا يُقرأ لا يُسرَّب.
 */

import { numberEnv, optionalEnv, requireEnv } from '../_shared/env.ts';
import { jsonResponse, requireSecret } from '../_shared/http.ts';
import { readTicketId } from '../_shared/payload.ts';
import { restClient } from '../_shared/db.ts';
import { embedTexts, toVectorLiteral } from '../_shared/embeddings.ts';
import { askModel } from '../_shared/llm.ts';
import { SYSTEM_PROMPT, buildUserPrompt } from '../_shared/prompt.ts';
import { buildDraftMessage, buildEscalationMessage } from '../_shared/telegram-update.ts';
import { sendMessage } from '../_shared/telegram.ts';
import {
  type AgentMode,
  type KbHit,
  type TicketFacts,
  type TicketMessage,
  decideAction,
  gateContext,
  gateTicket,
  replyBody,
} from '../_shared/decide.ts';

/** آخر ما يُقرأ من المحادثة — تذكرةٌ طويلة لا تُقرأ كلّها. */
const MAX_MESSAGES = 12;
/** عدد مقاطع المعرفة التي تُعرض على النموذج. */
const MATCH_COUNT = 6;

type TicketRow = {
  id: string;
  ticket_number: string;
  requester_kind: string;
  status: string;
  subject: string;
  category: string;
  priority: string;
};

type MessageRow = { author_kind: string; body: string; created_at: string };

/**
 * تنبيه صاحب المنصّة.
 *
 * ★★★ لا يُسقط العملية: المسوّدة محفوظة في `support_ai_logs` **قبل**
 * هذا النداء، فلو سقط تلغرام بقيت المسوّدة قابلةً للإرسال. لكنه لا
 * يصمت كذلك (قاعدة ٨): الفشل يُسجَّل خادميًّا ويُكتب في صفّ السجلّ،
 * فتنبيهٌ ضائع يُشخَّص بدل أن يُفسَّر «المساعد لم يعمل».
 */
async function notifyOwner(
  text: string,
  keyboard: unknown | undefined,
  logId: string,
  rest: { patch: (table: 'support_ai_logs', query: string, fields: Record<string, unknown>) => Promise<unknown> },
): Promise<void> {
  const result = await sendMessage(text, keyboard ? { keyboard } : {});
  if (result.ok) return;
  console.error(JSON.stringify({
    event: 'telegram_notify_failed', logId, detail: result.detail,
  }));
  await rest.patch('support_ai_logs', `id=eq.${logId}`, {
    error: `TELEGRAM_FAILED: ${result.detail.slice(0, 200)}`,
    updated_at: new Date().toISOString(),
  });
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    // ★ رمز ارتباط يُسجَّل ويُعاد (قاعدة ٨) — ولا يخرج استثناء عاريًا
    //   من `Deno.serve` (العطل الذي كشفه الإنتاج في المرحلة ٣).
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(JSON.stringify({
      event: 'support_agent_failed',
      reference,
      message: error instanceof Error ? error.message : String(error),
    }));
    return jsonResponse({ error: 'AGENT_FAILED', reference }, 500);
  }
});

async function handle(request: Request): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const denied = await requireSecret(
    request,
    'x-support-secret',
    requireEnv('SUPPORT_WEBHOOK_SECRET'),
  );
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'INVALID_JSON' }, 400);
  }

  const ticketId = readTicketId(body);
  if (!ticketId) return jsonResponse({ error: 'NO_TICKET_ID' }, 400);

  const mode: AgentMode = optionalEnv('AI_MODE', 'draft') === 'auto' ? 'auto' : 'draft';
  const minConfidence = numberEnv('AI_MIN_CONFIDENCE', 0.75);
  const minSimilarity = numberEnv('AI_MIN_SIMILARITY', 0.65);
  const siteUrl = optionalEnv('SITE_URL', 'https://nilemarket.online').replace(/\/+$/, '');

  const rest = restClient();

  const tickets = await rest.select<TicketRow>(
    'support_tickets',
    // ★ الأعمدة مُسمّاة واحدًا واحدًا: `select=*` يسحب
    //   `related_payment_id` و`related_subscription_id` إلى سياق
    //   النموذج بلا داعٍ. ما لا يُقرأ لا يُسرَّب.
    'select=id,ticket_number,requester_kind,status,subject,category,priority'
      + `&id=eq.${ticketId}&limit=1`,
  );
  if (!tickets.length) return jsonResponse({ error: 'TICKET_NOT_FOUND' }, 404);

  const row = tickets[0];
  const ticket: TicketFacts = {
    id: row.id,
    ticketNumber: row.ticket_number,
    requesterKind: row.requester_kind,
    status: row.status,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
  };

  const messageRows = await rest.select<MessageRow>(
    'support_messages',
    `select=author_kind,body,created_at&ticket_id=eq.${ticketId}`
      + `&order=created_at.asc&limit=${MAX_MESSAGES}`,
  );
  const messages: TicketMessage[] = messageRows.map((message) => ({
    authorKind: message.author_kind,
    body: message.body,
    createdAt: message.created_at,
  }));

  const gate = gateTicket(ticket, messages);
  // ★★ التخطّي قبل المطالبة: لا نحتلّ صفّ التذكرة لأجل «لا عمل لنا» —
  //    فلو أجاب بشريٌّ ثم أُغلقت التذكرة وأُعيد فتحها، يبقى المساعد
  //    قادرًا على العمل لو احتجناه لاحقًا.
  if (gate.kind === 'skip') {
    return jsonResponse({ ticketId, action: 'skip', reason: gate.reason });
  }

  // ═══ المطالبة الذرّية ═══
  const claimed = await rest.upsert<{ id: string }>(
    'support_ai_logs',
    [{ ticket_id: ticketId, action: 'draft', status: 'pending' }],
    'ticket_id',
    'select=id',
    // ★★★ `ignore-duplicates` لا `merge-duplicates`: الدمج يُحدِّث
    //    الصفّ القائم فيعود صفٌّ ⇒ تبدو المطالبة ناجحة فيُعالَج نفس
    //    التذكرة مرّتين. والتجاهل يعيد **صفرًا** عند التعارض، وهو
    //    الإشارة التي نبني عليها.
    'resolution=ignore-duplicates,return=representation',
  );
  if (!claimed.length) {
    return jsonResponse({ ticketId, action: 'skip', reason: 'مُعالَجة سابقًا' });
  }
  const logId = claimed[0].id;

  const finish = async (fields: Record<string, unknown>) => {
    await rest.patch('support_ai_logs', `id=eq.${logId}`, {
      ...fields,
      updated_at: new Date().toISOString(),
    });
  };

  try {
    const escalate = async (reason: string) => {
      await finish({ action: 'escalate', status: 'escalated', reason });
      await notifyOwner(
        buildEscalationMessage({
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          reason,
          ticketUrl: `${siteUrl}/admin/support/${ticketId}`,
        }),
        undefined, logId, rest,
      );
      return jsonResponse({ ticketId, action: 'escalate', reason });
    };

    if (gate.kind === 'escalate') return await escalate(gate.reason);

    const [queryVector] = await embedTexts([gate.question], 'query');
    const hits = await rest.rpc<KbHit[]>('match_support_kb', {
      p_query_embedding: toVectorLiteral(queryVector),
      p_match_count: MATCH_COUNT,
      p_min_similarity: 0,
    });

    const context = gateContext(hits, minSimilarity);
    if (context.kind === 'escalate') return await escalate(context.reason);

    const { answer, usage } = await askModel(
      SYSTEM_PROMPT,
      buildUserPrompt(ticket, messages, context.hits),
    );
    const decision = decideAction(answer, { mode, minConfidence });

    const common = {
      category: answer.category,
      confidence: answer.confidence,
      reason: decision.reason,
      draft_reply: answer.answer || null,
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    };

    if (decision.action === 'escalate') {
      await finish({ ...common, action: 'escalate', status: 'escalated' });
      await notifyOwner(
        buildEscalationMessage({
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          reason: decision.reason,
          ticketUrl: `${siteUrl}/admin/support/${ticketId}`,
        }),
        undefined, logId, rest,
      );
      return jsonResponse({ ticketId, action: 'escalate', reason: decision.reason });
    }

    if (decision.action === 'draft') {
      // ★★★ الصفّ يُكتب **قبل** التنبيه لا بعده: لو انعكس الترتيب وسقط
      //    التنبيه لبقي الصفّ على ما كان، فيُعاد نداء المساعد فيُحسب
      //    نموذجٌ ثانٍ — أو تبقى المسوّدة `pending` بلا نصّ فلا يجد
      //    زرُّ «أرسل» ما يرسله.
      await finish({ ...common, action: 'draft', status: 'pending' });
      const { text, keyboard } = buildDraftMessage({
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        category: answer.category,
        confidence: answer.confidence,
        draft: answer.answer,
        logId,
        ticketUrl: `${siteUrl}/admin/support/${ticketId}`,
      });
      await notifyOwner(text, keyboard, logId, rest);
      return jsonResponse({
        ticketId, action: 'draft', reason: decision.reason,
        confidence: answer.confidence, draft: answer.answer,
      });
    }

    const sent = await rest.rpc<{ message_id: string; status_changed: boolean }[]>(
      'ai_support_reply',
      { p_ticket_id: ticketId, p_body: replyBody(answer.answer, mode) },
    );
    const statusChanged = sent?.[0]?.status_changed === true;
    await finish({
      ...common,
      action: 'reply',
      status: 'sent',
      // ★★ رفضُ نقل الحالة لا يُبتلع: يُكتب في `error` فيُرى في السجلّ
      //    (قاعدة ٨). الردّ وصل، لكن الطابور قد يكذب — ويجب أن نعرف.
      error: statusChanged ? null : 'STATUS_NOT_CHANGED',
    });
    return jsonResponse({
      ticketId, action: 'reply', reason: decision.reason,
      confidence: answer.confidence, statusChanged,
    });
  } catch (error) {
    // ★★★ الفشل يُكتب في الصفّ المُطالَب به لا يُترك `pending` إلى
    //    الأبد: `pending` معناه «مسوّدةٌ تنتظر صاحب المنصّة»، وتركُ
    //    فشلٍ فيها يجعله مسوّدةً وهميّة لا تُرسل ولا تُشخَّص.
    const message = error instanceof Error ? error.message : String(error);
    await finish({ action: 'escalate', status: 'failed', error: message.slice(0, 500) });
    throw error;
  }
}
