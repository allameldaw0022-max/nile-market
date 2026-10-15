/**
 * نفاذ القاعدة من الدوالّ الطرفية — عبر PostgREST بـ`fetch` مباشرة.
 *
 * ★★ لماذا بلا عميل: العميل يُحمَّل من شبكة وقت النشر ويُضيف تبعيةً
 * تُحلّ في مشغّلٍ لا نراه، ونحن نحتاج أربع عمليات لا أكثر. وبلا عميل
 * تبقى سطور التلامس مع القاعدة **معدودةً وظاهرة** — وهذا هو ما يُراجَع
 * أمنيًّا (القاعدة ٥: لا تُقرأ إلا جداول الدعم وقاعدة المعرفة).
 *
 * ★★★ والجداول المسموحة مُعلَنة في `ALLOWED_TABLES` ويُفحص الاسم عند
 * كل نداء: فحارسٌ في `tests/ai-support-shared.test.ts` يقرأ هذه القائمة
 * ويمنع تسلّل جدولٍ ماليّ أو جدول طلبات إلى مسار المساعد لاحقًا.
 */

import { supabaseEnv } from './env.ts';

export const ALLOWED_TABLES = [
  'support_kb_chunks',
  'support_tickets',
  'support_messages',
  'support_ai_logs',
] as const;

export type AllowedTable = (typeof ALLOWED_TABLES)[number];

/**
 * ★★ ودالّات RPC محصورة كذلك: `rest.rpc` تتجاوز قائمة الجداول بطبعها
 * (الاسم في المسار لا في الجدول)، فلولا هذه القائمة لصار نداء أي
 * دالّةٍ ممنوحةٍ لـ`service_role` — وفيها ما يكتب في الطلبات والمخزون
 * — سطرًا واحدًا بعيدًا عن مسار المساعد.
 */
export const ALLOWED_RPCS = [
  'match_support_kb',
  'ai_support_reply',
] as const;

export type AllowedRpc = (typeof ALLOWED_RPCS)[number];

const assertAllowed = (table: string): void => {
  if (!(ALLOWED_TABLES as readonly string[]).includes(table)) {
    throw new Error(`TABLE_NOT_ALLOWED: ${table}`);
  }
};

const assertAllowedRpc = (fn: string): void => {
  if (!(ALLOWED_RPCS as readonly string[]).includes(fn)) {
    throw new Error(`RPC_NOT_ALLOWED: ${fn}`);
  }
};

export type Rest = {
  select: <T>(table: AllowedTable, query: string) => Promise<T[]>;
  upsert: <T>(table: AllowedTable, rows: unknown[], onConflict: string, query?: string) => Promise<T[]>;
  remove: <T>(table: AllowedTable, query: string) => Promise<T[]>;
  rpc: <T>(fn: AllowedRpc, args: Record<string, unknown>) => Promise<T>;
};

export function restClient(): Rest {
  const { url, serviceKey } = supabaseEnv();
  const base = `${url.replace(/\/+$/, '')}/rest/v1`;
  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
  };

  const send = async (path: string, init: RequestInit, prefer?: string): Promise<unknown> => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...(prefer ? { prefer } : {}) },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    if (!response.ok) {
      // ★ الرسالة تُقتطع: جوابُ PostgREST قد يحمل صفًّا كاملًا، ولا
      //   نريد بيانات تاجرٍ في سجلّ خطأ.
      throw new Error(`REST_${response.status} ${path.split('?')[0]}: ${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : null;
  };

  return {
    select: async <T>(table: AllowedTable, query: string) => {
      assertAllowed(table);
      return (await send(`/${table}?${query}`, { method: 'GET' })) as T[];
    },
    upsert: async <T>(
      table: AllowedTable,
      rows: unknown[],
      onConflict: string,
      query = 'select=id',
    ) => {
      assertAllowed(table);
      return (await send(
        `/${table}?on_conflict=${encodeURIComponent(onConflict)}&${query}`,
        { method: 'POST', body: JSON.stringify(rows) },
        'resolution=merge-duplicates,return=representation',
      )) as T[];
    },
    remove: async <T>(table: AllowedTable, query: string) => {
      assertAllowed(table);
      return (await send(
        `/${table}?${query}`,
        { method: 'DELETE' },
        'return=representation',
      )) as T[];
    },
    rpc: async <T>(fn: AllowedRpc, args: Record<string, unknown>) => {
      assertAllowedRpc(fn);
      return (await send(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })) as T;
    },
  };
}
