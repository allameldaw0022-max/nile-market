/**
 * تصنيفات تذاكر الدعم.
 *
 * في ملف مستقل لأن ملف `'use server'` لا يُصدِّر إلا دوالًا async —
 * وهذه القائمة تُقرأ في الخادم والمتصفح معًا.
 * القيم تطابق `public.ticket_category` في القاعدة.
 */
export const TICKET_CATEGORIES = [
  { value: 'orders', label: 'الطلبات' },
  { value: 'payments', label: 'المدفوعات' },
  { value: 'subscription', label: 'الاشتراك' },
  { value: 'products', label: 'المنتجات' },
  { value: 'domain', label: 'الدومين' },
  { value: 'account', label: 'الحساب' },
  { value: 'technical', label: 'مشكلة تقنية' },
  { value: 'other', label: 'أخرى' },
] as const;

export const TICKET_CATEGORY_LABEL: Record<string, string> =
  Object.fromEntries(TICKET_CATEGORIES.map((c) => [c.value, c.label]));
