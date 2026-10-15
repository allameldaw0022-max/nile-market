/**
 * استخراج معرّف التذكرة من جسم الطلب — نقيّ، فيُختبر.
 *
 * ★★★ لماذا يستحقّ ملفًّا: الداخل هنا من **محفّز قاعدة** شكلُه ليس
 * عقدًا نكتبه نحن، ومن نداءٍ يدويّ. وخطأٌ واحد — أن يُؤخذ `record.id`
 * من محفّزٍ على `support_messages` — يجعل المساعد يبحث عن تذكرةٍ
 * بمعرّف **رسالة**، فيعيد 404 لكل تذكرة في المنصّة بصمتٍ تامّ. فالقبول
 * مشروطٌ باسم الجدول لا بوجود الحقل.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidOrNull = (value: unknown): string | null =>
  typeof value === 'string' && UUID.test(value) ? value : null;

export function readTicketId(body: unknown): string | null {
  const payload = body as {
    ticketId?: unknown;
    table?: unknown;
    record?: { ticket_id?: unknown; id?: unknown };
  };

  // نداء مباشر (اختبار، أو إعادة تشغيل يدوية).
  const direct = uuidOrNull(payload?.ticketId);
  if (direct) return direct;

  // محفّز على `support_messages`: المفتاح في `record.ticket_id`.
  const fromRecord = uuidOrNull(payload?.record?.ticket_id);
  if (fromRecord) return fromRecord;

  // ★ محفّزٌ على `support_tickets` نفسه: `record.id` هو التذكرة —
  //   ولا يُقبل إلا إن أعلن الطلب هذا الجدول بعينه (انظر أعلى الملفّ).
  if (payload?.table === 'support_tickets') return uuidOrNull(payload?.record?.id);

  return null;
}
