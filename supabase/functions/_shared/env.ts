/**
 * قراءة الإعدادات من البيئة — لا قيمة سرّية في الكود.
 *
 * ★★★ `requireEnv` ترفع عند الغياب ولا تُرجع قيمةً افتراضية: سرٌّ
 * ناقصٌ يجب أن يُسقط الدالّة في أوّل نداء برسالةٍ تسمّي المتغيّر، لا
 * أن يمضي الطلب ثم يفشل في منتصفه برسالةٍ من المزوّد لا تدلّ على شيء.
 */

const read = (name: string): string | undefined => {
  const value = Deno.env.get(name);
  return value && value.trim() ? value.trim() : undefined;
};

export function requireEnv(name: string): string {
  const value = read(name);
  if (!value) throw new Error(`MISSING_ENV: ${name}`);
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return read(name) ?? fallback;
}

/**
 * ★ رقمٌ غير صالح لا يُبتلَع إلى الافتراضي: عتبةُ ثقةٍ كُتبت خطأً
 *   («0,75») تصير صفرًا بالصمت فيُرسل المساعد كل شيء بلا تحفّظ.
 */
export function numberEnv(name: string, fallback: number): number {
  const raw = read(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`INVALID_ENV: ${name}=${raw}`);
  return value;
}

/** متغيّرات يضخّها مشغّل Supabase نفسه في كل دالّة طرفية. */
export const supabaseEnv = () => ({
  url: requireEnv('SUPABASE_URL'),
  serviceKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
});
