import 'server-only';

/**
 * سجلّ مُهيكل.
 *
 * ★ لا بيانات شخصية في السجلّ: لا بريد ولا هاتف ولا عنوان ولا توكن.
 * المعرّفات وحدها (uuid) تكفي للربط، والباقي يُقرأ من القاعدة عند
 * الحاجة بصلاحية. سجلّ يسرّب بيانات عميل يصير مصدر تسريب دائم.
 *
 * ★ سطر JSON واحد لكل حدث: Vercel وأي مجمّع سجلّات يقرؤه حقولًا لا
 * نصًّا، فيمكن البحث والتنبيه عليه.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type Fields = Record<string, string | number | boolean | null | undefined>;

/** مفاتيح لا تُكتب مهما مُرِّرت — شبكة أمان أخيرة لا بديل عن الانتباه. */
const FORBIDDEN = new Set([
  'email', 'phone', 'password', 'token', 'secret', 'authorization',
  'address', 'full_name', 'name', 'reference', 'body', 'cookie',
  'visitor_token', 'guest_token', 'api_key',
]);

function sanitize(fields: Fields): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (FORBIDDEN.has(key.toLowerCase())) {
      out[key] = '[محجوب]';
      continue;
    }
    out[key] = typeof value === 'string' ? value.slice(0, 500) : value;
  }
  return out;
}

function emit(level: LogLevel, event: string, fields: Fields = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitize(fields),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Fields) => {
    if (process.env.NODE_ENV === 'production') return;
    emit('debug', event, fields);
  },
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
};

/**
 * يقيس زمن عملية ويسجّله.
 * يُعيد ما تُعيده العملية، ويُعيد رمي الخطأ بعد تسجيله — المراقبة لا
 * تبتلع الأعطال.
 */
export async function measure<T>(
  event: string, fn: () => Promise<T>, fields: Fields = {},
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    log.info(event, { ...fields, ms: Date.now() - started, ok: true });
    return result;
  } catch (error) {
    log.error(event, {
      ...fields,
      ms: Date.now() - started,
      ok: false,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}
