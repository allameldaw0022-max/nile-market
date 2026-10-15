/**
 * أدوات الطلب والجواب — ومقارنة الأسرار.
 *
 * ★★★ لماذا مقارنةٌ على البصمة لا `===`: مقارنة النصوص تتوقّف عند
 * أوّل حرفٍ مختلف، فزمنُ الردّ يكشف طول البادئة الصحيحة ⇒ يُخمَّن
 * السرّ حرفًا حرفًا. والمقارنة على بصمة SHA-256 تجعل الطرفين بطولٍ
 * واحدٍ ثابت، فلا يحمل الزمن خبرًا.
 *
 * ★★ ولماذا سرٌّ خاصّ أصلًا والدالّة محميّة بـJWT: مشغّل Supabase
 * يقبل **مفتاح anon** جوازًا، وهو مفتاحٌ عامّ في كل متصفّح ⇒ أي أحد
 * يستطيع نداء الدالّة. فالجدار هو هذا السرّ لا الـJWT.
 */

const digest = async (text: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

export async function secretMatches(provided: string | null, expected: string): Promise<boolean> {
  if (!provided) return false;
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * يتحقّق من ترويسة السرّ.
 *
 * ★ يعيد `Response` عند الرفض و`null` عند القبول — فنداؤه في أوّل
 *   سطرٍ من المعالج يجعل تجاهل النتيجة خطأً ظاهرًا لا نسيانًا صامتًا.
 * ★ والردّ 401 بلا تفصيل: «السرّ خطأ» و«السرّ غائب» جوابهما واحد.
 */
export async function requireSecret(
  request: Request,
  header: string,
  expected: string,
): Promise<Response | null> {
  const ok = await secretMatches(request.headers.get(header), expected);
  return ok ? null : jsonResponse({ error: 'UNAUTHORIZED' }, 401);
}
