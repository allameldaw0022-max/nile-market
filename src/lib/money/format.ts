/**
 * تنسيق المبالغ. القيمة المخزَّنة numeric(14,2) في القاعدة، والتنسيق
 * هنا للعرض فقط — لا يُحسب مبلغ في الواجهة إطلاقًا (D10).
 */
const nf = new Intl.NumberFormat('ar-SD', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: true,
});

export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return '٠ ج.س';
  return `${nf.format(n)} ج.س`;
}

export function formatNumber(value: number | null | undefined): string {
  return nf.format(value ?? 0);
}

const df = new Intl.DateTimeFormat('ar-SD', {
  dateStyle: 'medium',
  timeZone: 'Africa/Khartoum',
});
const dtf = new Intl.DateTimeFormat('ar-SD', {
  dateStyle: 'medium', timeStyle: 'short',
  timeZone: 'Africa/Khartoum',
});

export const formatDate = (d: string | Date | null | undefined) =>
  d ? df.format(new Date(d)) : '—';
export const formatDateTime = (d: string | Date | null | undefined) =>
  d ? dtf.format(new Date(d)) : '—';
