/**
 * توحيد أرقام الهاتف على صيغة السودان الدولية.
 *
 * ★ لماذا التوحيد؟ الرقم نفسه يُكتب بأربع صور على الأقل:
 * `0912345678` و`912345678` و`+249912345678` و`00249 91 234 5678`.
 * وتخزينه كما كُتب يعني أن البحث عن عميل أو تصدير قائمة أو فتح رابط
 * واتساب يفشل على صور لا على أخرى — والرقم واحد.
 *
 * ★ لا يُلصق `249` بكل ما يُكتب: رقم صرّح صاحبه بمفتاح دولة أخرى
 * (`+966…`) يبقى كما هو. إلصاق مفتاح السودان به يفسده ولا يصلحه،
 * والطلب «إضافة 249» معناه توحيد الأرقام المحلّية لا إعادة تعريف
 * أرقام الناس.
 *
 * ★ الطول المعياري في السودان: تسعة أرقام بعد المفتاح، وتُكتب محليًا
 * بصفر بادئ. ودالة تتبّع الطلب في القاعدة تطابق **آخر تسعة أرقام**
 * بعد تجريد الرموز، فالتوحيد لا يكسر طلبًا سابقًا مخزَّنًا بصيغة
 * أخرى — الجانبان يتساويان عند آخر تسعة.
 */

export const SUDAN_CODE = '249';

/** طول الرقم الوطني (بعد المفتاح). */
const NSN = 9;

/**
 * يعيد الرقم بصيغة `249XXXXXXXXX` حين يكون سودانيًا أو محلّي الصيغة،
 * ويعيد الأرقام كما هي حين يحمل مفتاحًا دوليًا آخر، و`null` حين لا
 * يكون رقمًا صالحًا أصلًا.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const input = (raw ?? '').trim();
  if (!input) return null;

  // `+` البادئة وحدها تدلّ على صيغة دولية؛ `00` مثلها.
  const explicitIntl = input.startsWith('+') || /^00\d/.test(input);
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (!digits) return null;

  // سودانيّ مصرَّح: 249 + تسعة.
  if (digits.startsWith(SUDAN_CODE) && digits.length === SUDAN_CODE.length + NSN) {
    return digits;
  }

  // محلّي بصفر بادئ: 0 + تسعة.
  if (digits.startsWith('0') && digits.length === NSN + 1) {
    return SUDAN_CODE + digits.slice(1);
  }

  // تسعة مجرّدة بلا صفر ولا مفتاح.
  if (!explicitIntl && digits.length === NSN) {
    return SUDAN_CODE + digits;
  }

  // ★ مفتاح دولة أخرى — أو طول غير معياري. يُحفظ كما كُتب بأرقامه:
  // تخمين مفتاح لرقم لا نعرف بلده يفسده، والرفض يمنع تاجرًا له
  // مورّد خارج السودان من تسجيل رقمه.
  return digits;
}

/** للعرض: `0912345678` من `249912345678`. */
export function localPhone(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  return n.startsWith(SUDAN_CODE) && n.length === SUDAN_CODE.length + NSN
    ? `0${n.slice(SUDAN_CODE.length)}`
    : n;
}

/** رقم واتساب: أرقام فقط بلا `+` — وهو ما يقبله `wa.me`. */
export function waNumber(raw: string | null | undefined): string | null {
  return normalizePhone(raw);
}
