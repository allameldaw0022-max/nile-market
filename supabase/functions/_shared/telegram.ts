/**
 * نداء تلغرام — الجزء الذي يلمس الشبكة وحده.
 *
 * ★★ فشلُ تلغرام **لا يُسقط** عمل المساعد: المسوّدة محفوظة في
 * `support_ai_logs` قبل أي نداء هنا، فلو سقط البوت بقيت المسوّدة
 * قابلةً للإرسال. لذا ترجع `notify` قيمةً بدل أن ترفع — والمنادي
 * يسجّل الفشل (قاعدة ٨) ولا يَفشل كلّه لأجله.
 */

import { optionalEnv, requireEnv } from './env.ts';

export type TelegramConfig = { botToken: string; ownerChatId: string; baseUrl: string };

export function telegramConfig(): TelegramConfig {
  return {
    botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    ownerChatId: requireEnv('TELEGRAM_OWNER_CHAT_ID'),
    baseUrl: optionalEnv('TELEGRAM_BASE_URL', 'https://api.telegram.org'),
  };
}

async function call(
  method: string,
  payload: Record<string, unknown>,
  config: TelegramConfig,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(
      `${config.baseUrl.replace(/\/+$/, '')}/bot${config.botToken}/${method}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const text = await response.text();
    // ★ جوابُ تلغرام 200 مع `ok: false` عند خطأ منطقيّ (وسمٌ غير مغلق
    //   مثلًا)، فلا يكفي فحص الشفرة — ولا يُقرأ الرمز إلا من الجسم.
    return { ok: response.ok && text.includes('"ok":true'), detail: text.slice(0, 300) };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export function sendMessage(
  text: string,
  options: { keyboard?: unknown; config?: TelegramConfig } = {},
): Promise<{ ok: boolean; detail: string }> {
  const config = options.config ?? telegramConfig();
  return call('sendMessage', {
    chat_id: config.ownerChatId,
    text,
    parse_mode: 'HTML',
    // ★ لا معاينة روابط: رابط لوحة الإدارة يفتح صفحةً تحتاج جلسة،
    //   فمعاينتها صورةُ تسجيل دخول تُغرق الرسالة بلا فائدة.
    link_preview_options: { is_disabled: true },
    ...(options.keyboard ? { reply_markup: options.keyboard } : {}),
  }, config);
}

export function answerCallback(
  callbackId: string,
  text: string,
  config: TelegramConfig = telegramConfig(),
): Promise<{ ok: boolean; detail: string }> {
  // ★★ الردّ على الضغطة واجب: بلا `answerCallbackQuery` تبقى الساعة
  //    تدور على زرّ صاحب المنصّة حتى تنتهي مهلة تلغرام، فيظنّ أنّ
  //    الضغطة لم تصل ويضغط مرّة أخرى.
  return call('answerCallbackQuery', { callback_query_id: callbackId, text }, config);
}

export function clearKeyboard(
  chatId: string,
  messageId: number,
  config: TelegramConfig = telegramConfig(),
): Promise<{ ok: boolean; detail: string }> {
  // ★ إزالة الأزرار بعد البتّ: زرٌّ باقٍ على رسالةٍ مبتوتة يُغري بضغطةٍ
  //   ثانية، والذرّية ستردّها — لكن الأفضل ألّا تُطلب.
  return call('editMessageReplyMarkup', {
    chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] },
  }, config);
}
