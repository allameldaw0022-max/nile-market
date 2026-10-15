/**
 * تحليل تحديثات تلغرام وبناء أزرارها — نقيّ، فيُختبر بلا شبكة.
 *
 * ★★★ لماذا كل شيءٍ هنا يُفحص: جسم التحديث يأتي من **الإنترنت**. ومن
 * يعرف رابط الدالّة يستطيع إرسال أي شكل. والسرّ في الترويسة هو الجدار
 * الأوّل، لكنه **لا يكفي**: لو سُرّب يومًا، فالجدار الثاني أن المساعد
 * لا يُطيع إلا محادثة صاحب المنصّة بعينها (`TELEGRAM_OWNER_CHAT_ID`)،
 * وأن `callback_data` تُحلّل إلى فعلٍ من اثنين ومعرّفٍ بصيغة UUID لا
 * غير — فلا يُمرَّر نصٌّ إلى استعلام.
 *
 * ★★ و«تجاهل» ليست «خطأ»: كل تحديثٍ لا يعنينا يُردّ عليه بـ200.
 * تلغرام يُعيد المحاولة على أي جواب غير ناجح، فجوابُ 4xx على رسالةٍ
 * عابرة يجعله يكرّرها دقائق — ثم يُعطّل الـwebhook إن تكرّر الفشل.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** الأفعال المسموحة من الأزرار — لا غيرها. */
export const CALLBACK_ACTIONS = ['send', 'skip'] as const;
export type CallbackAction = (typeof CALLBACK_ACTIONS)[number];

/** حدّ تلغرام لـ`callback_data`: ٦٤ بايتًا. */
export const MAX_CALLBACK_BYTES = 64;

export function buildCallbackData(action: CallbackAction, logId: string): string {
  const data = `${action}:${logId}`;
  // ★ يُفحص الآن لا عند الإرسال: تجاوزُ الحدّ يجعل تلغرام يرفض الرسالة
  //   كلّها، فتضيع المسوّدة بلا زرّ — ولا يظهر السبب في جوابه.
  if (new TextEncoder().encode(data).length > MAX_CALLBACK_BYTES) {
    throw new Error(`CALLBACK_DATA_TOO_LONG: ${data.length}`);
  }
  return data;
}

export function parseCallbackData(data: unknown): { action: CallbackAction; logId: string } | null {
  if (typeof data !== 'string') return null;
  const [action, logId, ...rest] = data.split(':');
  if (rest.length) return null;
  if (!(CALLBACK_ACTIONS as readonly string[]).includes(action)) return null;
  if (!logId || !UUID.test(logId)) return null;
  return { action: action as CallbackAction, logId };
}

export type TelegramEvent =
  | { kind: 'callback'; callbackId: string; chatId: string; messageId: number;
      action: CallbackAction; logId: string }
  | { kind: 'command'; chatId: string; text: string }
  | { kind: 'ignore'; reason: string };

/**
 * يحوّل تحديث تلغرام إلى حدثٍ مفهوم — أو «تجاهل» مع سببه.
 *
 * ★ `ownerChatId` يُمرَّر لا يُقرأ من البيئة: فالمقارنة تُختبر.
 */
export function parseUpdate(body: unknown, ownerChatId: string): TelegramEvent {
  const update = body as {
    callback_query?: {
      id?: unknown;
      data?: unknown;
      message?: { message_id?: unknown; chat?: { id?: unknown } };
      from?: { id?: unknown };
    };
    message?: { text?: unknown; chat?: { id?: unknown } };
  };

  const callback = update?.callback_query;
  if (callback) {
    const chatId = String(callback.message?.chat?.id ?? '');
    // ★★★ المحادثة **وصاحبها** معًا: في مجموعةٍ تكون المحادثة واحدة
    //   وأعضاؤها كثيرين، فمن أضاف البوت إلى مجموعةٍ فيها صاحب المنصّة
    //   صار قادرًا على الضغط. فيُشترط أن يكون الضاغط هو المالك.
    const fromId = String(callback.from?.id ?? '');
    if (chatId !== ownerChatId || fromId !== ownerChatId) {
      return { kind: 'ignore', reason: 'ليست محادثة صاحب المنصّة' };
    }
    const parsed = parseCallbackData(callback.data);
    if (!parsed) return { kind: 'ignore', reason: 'زرّ غير معروف' };
    const callbackId = typeof callback.id === 'string' ? callback.id : '';
    const messageId = Number(callback.message?.message_id);
    if (!callbackId || !Number.isInteger(messageId)) {
      return { kind: 'ignore', reason: 'تحديث ناقص' };
    }
    return { kind: 'callback', callbackId, chatId, messageId, ...parsed };
  }

  const message = update?.message;
  if (message) {
    const chatId = String(message.chat?.id ?? '');
    if (chatId !== ownerChatId) {
      return { kind: 'ignore', reason: 'ليست محادثة صاحب المنصّة' };
    }
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    if (!text.startsWith('/')) return { kind: 'ignore', reason: 'ليست أمرًا' };
    return { kind: 'command', chatId, text };
  }

  return { kind: 'ignore', reason: 'نوع تحديث لا نتعامل معه' };
}

/**
 * تهريب HTML.
 *
 * ★★★ نصّ المسوّدة من النموذج، ونصّ التذكرة من التاجر. وتلغرام
 * بـ`parse_mode: HTML` **يرفض الرسالة كلّها** عند وسمٍ غير مغلق
 * (`<` في «السعر < 100» مثلًا) ⇒ تضيع المسوّدة ولا يصل زرّ، ولا يُفهم
 * السبب من جوابه. فيُهرَّب كل نصٍّ ليس من كتابتنا.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export type DraftNotice = {
  ticketNumber: string;
  subject: string;
  category: string;
  confidence: number;
  draft: string;
  logId: string;
  ticketUrl: string;
};

/** أقصى ما يُعرض من المسوّدة في تلغرام (حدّ الرسالة ٤٠٩٦ حرفًا). */
export const MAX_TELEGRAM_BODY = 2800;

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max)}…`;

export function buildDraftMessage(notice: DraftNotice): {
  text: string;
  keyboard: { inline_keyboard: { text: string; callback_data: string }[][] };
} {
  const text = [
    `<b>مسوّدة ردّ — ${escapeHtml(notice.ticketNumber)}</b>`,
    `الموضوع: ${escapeHtml(clip(notice.subject, 120))}`,
    `التصنيف: ${escapeHtml(notice.category)} · الثقة: ${notice.confidence.toFixed(2)}`,
    '',
    `<pre>${escapeHtml(clip(notice.draft, MAX_TELEGRAM_BODY))}</pre>`,
    '',
    notice.ticketUrl,
  ].join('\n');

  return {
    text,
    keyboard: {
      inline_keyboard: [[
        { text: '✅ أرسل للتاجر', callback_data: buildCallbackData('send', notice.logId) },
        { text: '✋ لا ترسل', callback_data: buildCallbackData('skip', notice.logId) },
      ]],
    },
  };
}

export function buildEscalationMessage(notice: {
  ticketNumber: string;
  subject: string;
  reason: string;
  ticketUrl: string;
}): string {
  return [
    `<b>تذكرة تحتاجك — ${escapeHtml(notice.ticketNumber)}</b>`,
    `الموضوع: ${escapeHtml(clip(notice.subject, 120))}`,
    `السبب: ${escapeHtml(clip(notice.reason, 300))}`,
    '',
    notice.ticketUrl,
  ].join('\n');
}
