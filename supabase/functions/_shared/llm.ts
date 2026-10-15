/**
 * طبقة النموذج اللغويّ — متوافقة مع OpenAI، فالمزوّد يُبدَّل بمتغيّر.
 *
 * ★★★ لماذا JSON مفروض لا نصّ حرّ: الجواب يُفرَّع عليه (يُرسل أم
 * يُحوَّل؟)، فجوابٌ نصّيّ يحتاج تحليلًا بالتعبيرات النمطية — وأوّل
 * جملةٍ لم نتوقّعها تجعل المساعد يرسل ما كان يجب أن يُحوَّل. ومع
 * `response_format: json_object` يبقى الاحتمال قائمًا، فيُفحص المخطّط
 * هنا ويُرفض ما لا يطابقه.
 *
 * ★★ ولا ثقة في `confidence` من النموذج وحدها: النماذج تُبالغ في ثقتها.
 * فهي **أحد** الشروط لا كلّها (انظر `decide.ts`): مع عتبة التشابه،
 * وعلم `needs_human`، ووضع المسوّدة.
 *
 * ★ والملفّ مقسوم كما في `embeddings.ts`: بناء الطلب وتحليل الجواب
 *   نقيّان يُختبران بلا شبكة، والنداء وحده يلمس `fetch`.
 */

import { numberEnv, optionalEnv, requireEnv } from './env.ts';

export type LlmConfig = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
};

/** جواب المساعد، بعد التحقّق من مخطّطه. */
export type AgentAnswer = {
  /** نصّ الردّ بالعربية — فارغٌ عند التحويل. */
  answer: string;
  /** ٠ إلى ١ — ثقة النموذج في أنّ المقاطع تحمل الجواب. */
  confidence: number;
  /** تصنيفٌ يختاره النموذج من قائمة تصنيفات التذاكر. */
  category: string;
  /** يطلب النموذج تحويل التذكرة إلى إنسان. */
  needsHuman: boolean;
  /** سببٌ قصير — يُعرض لصاحب المنصّة لا للتاجر. */
  reason: string;
};

export type LlmUsage = { model: string; inputTokens: number; outputTokens: number };

const PROVIDER_BASE: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com',
};

const PROVIDER_MODEL: Record<string, string> = {
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o-mini',
};

export function llmConfig(): LlmConfig {
  const provider = optionalEnv('LLM_PROVIDER', 'deepseek');
  return {
    provider,
    baseUrl: optionalEnv('LLM_BASE_URL', PROVIDER_BASE[provider] ?? ''),
    model: optionalEnv('LLM_MODEL', PROVIDER_MODEL[provider] ?? ''),
    // ★ المفتاح باسم المزوّد: تبديل المزوّد لا يُجبرنا على إعادة تسمية
    //   سرٍّ في لوحة Supabase، ومفتاحا مزوّدين يتعايشان.
    apiKey: provider === 'openai' ? requireEnv('OPENAI_API_KEY') : requireEnv('DEEPSEEK_API_KEY'),
    maxTokens: numberEnv('LLM_MAX_TOKENS', 700),
    // ★ حرارةٌ منخفضة لا صفر: صفرٌ يجعل النموذج يكرّر صيغةً واحدة
    //   حرفيًّا في كل تذكرة فتبدو الردود آليّة.
    temperature: numberEnv('LLM_TEMPERATURE', 0.2),
  };
}

export function buildChatRequest(
  system: string,
  user: string,
  config: LlmConfig,
): { url: string; body: unknown } {
  if (!config.baseUrl || !config.model) {
    throw new Error(`UNCONFIGURED_LLM: provider=${config.provider}`);
  }
  return {
    url: `${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`,
    body: {
      model: config.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      response_format: { type: 'json_object' },
    },
  };
}

const TICKET_CATEGORIES = new Set([
  'technical', 'billing', 'subscription', 'orders', 'domains', 'account', 'other',
]);

/**
 * يحوّل جواب المزوّد إلى `AgentAnswer` — أو يرفع.
 *
 * ★★★ كل حقلٍ يُفحص: جوابٌ ناقصٌ **لا يُكمَّل بافتراض**. لو جُعلت
 * `confidence` الغائبة صفرًا لمضى الأمر بهدوء إلى التحويل (مقبول)،
 * لكن لو جُعلت واحدًا لأرسل المساعد ردًّا لم يُقدّر ثقته أحد. والرفض
 * الصريح يُظهر خللًا في النموذج أو في الطلب بدل أن يخفيه.
 */
export function parseAgentAnswer(payload: unknown): { answer: AgentAnswer; usage: LlmUsage } {
  const root = payload as {
    model?: unknown;
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };

  const content = root?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('LLM_EMPTY_CONTENT');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`LLM_NOT_JSON: ${content.slice(0, 160)}`);
  }

  const obj = raw as Record<string, unknown>;
  const confidence = typeof obj.confidence === 'number' ? obj.confidence : Number.NaN;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`LLM_BAD_CONFIDENCE: ${String(obj.confidence)}`);
  }
  if (typeof obj.needs_human !== 'boolean') {
    throw new Error(`LLM_BAD_NEEDS_HUMAN: ${String(obj.needs_human)}`);
  }
  const answer = typeof obj.answer === 'string' ? obj.answer.trim() : '';
  // ★ تصنيفٌ لا نعرفه يصير `other` لا خطأً: التصنيف زينةٌ في السجلّ،
  //   وإسقاط التذكرة كلّها لأجله خسارةٌ بلا مقابل.
  const category = typeof obj.category === 'string' && TICKET_CATEGORIES.has(obj.category)
    ? obj.category
    : 'other';

  return {
    answer: {
      answer,
      confidence,
      category,
      needsHuman: obj.needs_human,
      reason: typeof obj.reason === 'string' ? obj.reason.slice(0, 500) : '',
    },
    usage: {
      model: typeof root.model === 'string' ? root.model : 'unknown',
      inputTokens: Number(root.usage?.prompt_tokens) || 0,
      outputTokens: Number(root.usage?.completion_tokens) || 0,
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export async function askModel(
  system: string,
  user: string,
  config: LlmConfig = llmConfig(),
): Promise<{ answer: AgentAnswer; usage: LlmUsage }> {
  const { url, body } = buildChatRequest(system, user, config);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await sleep(800 * 2 ** (attempt - 1));
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      // ★ مهلة سخيّة: النموذج يفكّر، والتذكرة تنتظر ثوانٍ لا مللي.
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      lastError = new Error(`LLM_HTTP_${response.status}: ${detail}`);
      if (!RETRYABLE.has(response.status)) throw lastError;
      continue;
    }
    return parseAgentAnswer(await response.json());
  }
  throw lastError ?? new Error('LLM_FAILED');
}
