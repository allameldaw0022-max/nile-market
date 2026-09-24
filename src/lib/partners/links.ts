/**
 * ★ هذا الملف لا يستورد `config`، بل العكس: `config` يبني
 * `rootDomain` و`siteUrl` منه. السبب أنّ `config` خادمي
 * (`server-only`)، بينما تحليل المضيف يحتاجه الـproxy واختبار
 * الوحدة معًا. مصدر القيمة واحد في الحالتين — هنا.
 */
export function rootDomain(): string {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nilemarket.online';
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

/**
 * رابط الإحالة القصير.
 *
 * ★ شكلان لنفس النظام، لا نظامَي إسناد:
 *   · `domain` — `https://1nilemarket.online` كما في المواصفة.
 *     يتطلّب تسجيل الدومين وشهادته لكل رقم (راجع التقرير).
 *   · `path`   — `https://nilemarket.online/1`. يعمل اليوم بلا أي
 *     إعداد خارجي، وهو الافتراضي حتى يكتمل الأول.
 *     و`/r/1` يبقى عاملًا للروابط المنشورة قبل هذا الشكل.
 *
 * الشكل يُختار بمتغيّر بيئة واحد؛ الترجمة إلى رمز الإحالة تحدث
 * خادميًا في الحالتين عبر `partner_code_by_serial`.
 */
export type PartnerLinkMode = 'domain' | 'path';

export function partnerLinkMode(): PartnerLinkMode {
  return process.env.NEXT_PUBLIC_PARTNER_LINK_MODE === 'domain' ? 'domain' : 'path';
}

/** الرابط القصير لرقم شريك. */
export function partnerShortLink(serial: number | null): string | null {
  if (serial === null || !Number.isFinite(serial)) return null;
  if (partnerLinkMode() === 'domain') {
    return `https://${serial}${rootDomain()}`;
  }
  return `${siteUrl().replace(/\/$/, '')}/${serial}`;
}

/** الرابط الطويل — يبقى صالحًا إلى الأبد (D19). */
export function partnerLegacyLink(code: string): string {
  return `${siteUrl().replace(/\/$/, '')}/?ref=${code}`;
}

/**
 * يطابق مضيفًا على شكل `<رقم><الدومين الجذر>` ويعيد الرقم.
 * `1nilemarket.online` ⇒ 1 · `nilemarket.online` ⇒ null ·
 * `shop.nilemarket.online` ⇒ null (نطاق فرعي لمتجر لا رابط شريك).
 */
export function serialFromHost(host: string): number | null {
  const h = host.toLowerCase().split(':')[0];
  const root = rootDomain().toLowerCase();
  if (!h.endsWith(root)) return null;
  const prefix = h.slice(0, h.length - root.length);
  if (!/^\d{1,9}$/.test(prefix)) return null;
  const n = Number(prefix);
  return n > 0 ? n : null;
}

/**
 * يطابق مسارًا على شكل `/<رقم>` ويعيد الرقم.
 *
 * ★ الحصر متعمَّد: جزء واحد، أرقام فقط، وأكبر من صفر. فلا يبتلع
 * `/admin` ولا `/partner` ولا `/r/1` ولا `/1/2` — ولا يخطف مسارًا
 * جديدًا يُضاف لاحقًا ما دام لا يبدأ برقم.
 *
 * ★ يُستدعى على مضيف المنصة وحده؛ مسارات المتاجر لا تمرّ به.
 */
export function serialFromPath(pathname: string): number | null {
  const match = /^\/(\d{1,9})$/.exec(pathname);
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? n : null;
}
