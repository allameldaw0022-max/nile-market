/** مصدر واحد لألوان وأسماء كل الحالات في النظام (Design System §17.5). */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'gold';

export const ORDER_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  new:       { label: 'جديد',        tone: 'info' },
  confirmed: { label: 'مؤكَّد',       tone: 'info' },
  preparing: { label: 'قيد التجهيز', tone: 'warning' },
  shipped:   { label: 'تم الشحن',    tone: 'warning' },
  completed: { label: 'مكتمل',       tone: 'success' },
  cancelled: { label: 'ملغي',        tone: 'danger' },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  unpaid:             { label: 'غير مدفوع',     tone: 'neutral' },
  pending:            { label: 'بانتظار التأكيد', tone: 'warning' },
  partially_paid:     { label: 'مدفوع جزئيًا',   tone: 'warning' },
  paid:               { label: 'مدفوع',          tone: 'success' },
  refunded:           { label: 'مسترد',          tone: 'danger' },
  partially_refunded: { label: 'مسترد جزئيًا',   tone: 'danger' },
};

export const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  trialing:  { label: 'تجربة',          tone: 'info' },
  active:    { label: 'نشط',            tone: 'success' },
  expiring:  { label: 'قارب الانتهاء',  tone: 'warning' },
  grace:     { label: 'فترة سماح',      tone: 'warning' },
  expired:   { label: 'منتهٍ',          tone: 'danger' },
  suspended: { label: 'موقوف',          tone: 'danger' },
  cancelled: { label: 'ملغى',           tone: 'neutral' },
};

export const STORE_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  draft:          { label: 'مسودة',          tone: 'neutral' },
  pending_review: { label: 'قيد المراجعة',   tone: 'warning' },
  active:         { label: 'نشط',            tone: 'success' },
  closed:         { label: 'مغلق',           tone: 'neutral' },
  suspended:      { label: 'موقوف',          tone: 'danger' },
};

export const PRODUCT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  draft:    { label: 'مسودة', tone: 'neutral' },
  active:   { label: 'منشور', tone: 'success' },
  hidden:   { label: 'مخفي',  tone: 'warning' },
  archived: { label: 'مؤرشف', tone: 'neutral' },
};

export const TICKET_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  new:              { label: 'جديدة',            tone: 'info' },
  open:             { label: 'مفتوحة',           tone: 'info' },
  in_progress:      { label: 'قيد المعالجة',     tone: 'warning' },
  waiting_customer: { label: 'بانتظار العميل',   tone: 'warning' },
  waiting_internal: { label: 'بانتظار فريق آخر', tone: 'warning' },
  resolved:         { label: 'تم الحل',          tone: 'success' },
  closed:           { label: 'مغلقة',            tone: 'neutral' },
};

export const PAYMENT_METHOD: Record<string, string> = {
  cash_on_delivery: 'الدفع عند الاستلام',
  bank_transfer:    'تحويل بنكي',
  bankak:           'بنكك',
};
