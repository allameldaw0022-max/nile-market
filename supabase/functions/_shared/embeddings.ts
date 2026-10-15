/**
 * طبقة التمثيل المتجهيّ — قابلة للتبديل.
 *
 * ★★★ لماذا طبقة لا نداءٌ مباشر: مزوّد التمثيل يُغيَّر (سعرًا أو
 * جودةً أو انقطاعًا)، والتغيير يجب أن يكون في ملفٍّ واحد لا في كل
 * دالّة. والأهمّ: **البعد مربوط بالمخطّط** — العمود `vector(768)`،
 * فمزوّدٌ يعيد ١٥٣٦ يُسقط الإدراج. لذا يُفحص البعد هنا برسالةٍ تسمّي
 * الرقمين، لا يُترك لخطأ Postgres الغامض.
 *
 * ★★ و`taskType` ليس زينة: نموذج Gemini يُولّد متجهًا **مختلفًا**
 * للمستند وللسؤال (`RETRIEVAL_DOCUMENT` مقابل `RETRIEVAL_QUERY`).
 * فهرسةٌ بنوعٍ وبحثٌ بآخر يُنقص دقّة الاسترجاع بلا أي خطأ ظاهر —
 * وهذا أسوأ أنواع العطل: نتائج أضعف بلا أثرٍ في أي سجلّ.
 *
 * ★★ والملفّ مقسوم: ما يبني الطلب ويحلّل الجواب **نقيّ** (يُختبر
 * بـnode بلا شبكة)، والنداء وحده هو ما يلمس `fetch`.
 */

import { optionalEnv, requireEnv } from './env.ts';

export type EmbeddingPurpose = 'document' | 'query';

export type EmbeddingConfig = {
  provider: string;
  model: string;
  dimensions: number;
  baseUrl: string;
  apiKey: string;
};

/** أقصى عدد نصوص في نداءٍ واحد — حدّ المزوّد ١٠٠، ونبقى دونه. */
export const BATCH_SIZE = 20;

const GEMINI_TASK: Record<EmbeddingPurpose, string> = {
  document: 'RETRIEVAL_DOCUMENT',
  query: 'RETRIEVAL_QUERY',
};

export function embeddingConfig(): EmbeddingConfig {
  const provider = optionalEnv('EMBEDDING_PROVIDER', 'gemini');
  if (provider !== 'gemini') {
    throw new Error(`UNSUPPORTED_EMBEDDING_PROVIDER: ${provider}`);
  }
  const dimensions = Number(optionalEnv('EMBEDDING_DIMENSIONS', '768'));
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error(`INVALID_ENV: EMBEDDING_DIMENSIONS=${dimensions}`);
  }
  return {
    provider,
    model: optionalEnv('EMBEDDING_MODEL', 'gemini-embedding-001'),
    dimensions,
    baseUrl: optionalEnv('EMBEDDING_BASE_URL', 'https://generativelanguage.googleapis.com'),
    apiKey: requireEnv('GEMINI_API_KEY'),
  };
}

export function buildGeminiRequest(
  texts: string[],
  purpose: EmbeddingPurpose,
  config: EmbeddingConfig,
): { url: string; body: unknown } {
  return {
    url: `${config.baseUrl}/v1beta/models/${config.model}:batchEmbedContents`,
    body: {
      requests: texts.map((text) => ({
        model: `models/${config.model}`,
        content: { parts: [{ text }] },
        taskType: GEMINI_TASK[purpose],
        outputDimensionality: config.dimensions,
      })),
    },
  };
}

export function parseGeminiResponse(
  payload: unknown,
  expectedCount: number,
  dimensions: number,
): number[][] {
  const embeddings = (payload as { embeddings?: { values?: unknown }[] })?.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== expectedCount) {
    throw new Error(
      `EMBEDDING_COUNT_MISMATCH: expected ${expectedCount}, got ${
        Array.isArray(embeddings) ? embeddings.length : 'none'
      }`,
    );
  }
  return embeddings.map((entry, index) => {
    const values = entry?.values;
    if (!Array.isArray(values) || values.length !== dimensions) {
      throw new Error(
        `EMBEDDING_DIMENSION_MISMATCH at ${index}: expected ${dimensions}, got ${
          Array.isArray(values) ? values.length : 'none'
        }`,
      );
    }
    for (const value of values) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`EMBEDDING_NOT_NUMERIC at ${index}`);
      }
    }
    return normalize(values as number[]);
  });
}

/**
 * ★ التطبيع: Gemini يعيد متجهًا **غير مطبَّع** لكل بعدٍ دون ٣٠٧٢.
 *   ومسافة الجيب لا تتأثّر بالمقياس، لكن التطبيع يجعل المتجهات
 *   متماثلة الطول فيبقى الفهرس صالحًا إن بدّلنا يومًا إلى الجداء
 *   الداخليّ — وهو خطأٌ صامتٌ لو لم نُطبّع.
 */
export function normalize(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const length = Math.sqrt(sum);
  if (!length) return vector;
  return vector.map((value) => value / length);
}

/** صيغة pgvector النصّية — تُمرَّر عبر PostgREST فيحلّلها Postgres. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** أخطاء يُجدي معها التكرار: تضييقُ معدّلٍ أو عطلٌ عابر عند المزوّد. */
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

async function callGemini(
  texts: string[],
  purpose: EmbeddingPurpose,
  config: EmbeddingConfig,
): Promise<number[][]> {
  const { url, body } = buildGeminiRequest(texts, purpose, config);
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await sleep(500 * 2 ** (attempt - 1));
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      lastError = new Error(`EMBEDDING_HTTP_${response.status}: ${detail}`);
      // ★ لا تكرار على 400/401/403: المفتاح أو الطلب خطأ، والتكرار
      //   يضيّع الوقت ويضاعف الكلفة بلا أمل.
      if (!RETRYABLE.has(response.status)) throw lastError;
      continue;
    }
    return parseGeminiResponse(await response.json(), texts.length, config.dimensions);
  }
  throw lastError ?? new Error('EMBEDDING_FAILED');
}

export async function embedTexts(
  texts: string[],
  purpose: EmbeddingPurpose,
  config: EmbeddingConfig = embeddingConfig(),
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    out.push(...(await callGemini(texts.slice(i, i + BATCH_SIZE), purpose, config)));
  }
  return out;
}
