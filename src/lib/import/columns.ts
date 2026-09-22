import type { ImportRow } from '@/lib/supabase/rpc';

/**
 * مطابقة ترويسات الملف بحقول المنتج.
 *
 * التاجر السوداني يصدّر ملفه من Excel عربي غالبًا، وقد يكتب «السعر»
 * أو «سعر البيع» أو `price`. المطابقة تقبل كل ذلك، وما لا يُعرَف
 * يُعرَض له كعمود غير مستخدم بدل أن يُخمَّن.
 */
export const IMPORT_FIELDS = {
  name: { label: 'اسم المنتج', required: true },
  price: { label: 'السعر', required: true },
  compare_at_price: { label: 'السعر قبل الخصم', required: false },
  sku: { label: 'رمز المنتج (SKU)', required: false },
  quantity: { label: 'الكمية', required: false },
  category: { label: 'التصنيف', required: false },
  description: { label: 'الوصف', required: false },
  slug: { label: 'الرابط', required: false },
} as const;

export type ImportField = keyof typeof IMPORT_FIELDS;

const ALIASES: Record<ImportField, string[]> = {
  name: ['name', 'product', 'product name', 'title',
         'الاسم', 'اسم', 'اسم المنتج', 'المنتج', 'الصنف'],
  price: ['price', 'sale price', 'selling price', 'unit price',
          'السعر', 'سعر', 'سعر البيع', 'السعر الحالي', 'سعر المنتج'],
  compare_at_price: ['compare at price', 'compare_at_price', 'old price',
                     'regular price', 'was',
                     'السعر قبل الخصم', 'السعر القديم', 'قبل الخصم', 'سعر التخفيض'],
  sku: ['sku', 'code', 'barcode', 'item code',
        'رمز', 'الرمز', 'رمز المنتج', 'كود', 'الكود', 'باركود'],
  quantity: ['quantity', 'qty', 'stock', 'inventory', 'on hand',
             'الكمية', 'كمية', 'المخزون', 'مخزون', 'العدد'],
  category: ['category', 'collection', 'type',
             'التصنيف', 'تصنيف', 'الفئة', 'فئة', 'القسم'],
  description: ['description', 'desc', 'details', 'body',
                'الوصف', 'وصف', 'التفاصيل', 'تفاصيل'],
  slug: ['slug', 'handle', 'url', 'الرابط', 'رابط'],
};

const normalize = (s: string) =>
  s.trim().toLowerCase()
    .replace(/[ً-ْ]/g, '')     // تشكيل
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[_\-/\\]+/g, ' ')
    .replace(/\s+/g, ' ');

/** يربط كل عمود في الملف بحقل، أو بـnull إن لم يُعرَف. */
export function mapHeaders(headers: string[]): (ImportField | null)[] {
  const taken = new Set<ImportField>();
  return headers.map((header) => {
    const key = normalize(header);
    for (const field of Object.keys(ALIASES) as ImportField[]) {
      if (taken.has(field)) continue;
      if (ALIASES[field].some((a) => normalize(a) === key)) {
        taken.add(field);
        return field;
      }
    }
    return null;
  });
}

/**
 * أرقام عربية-هندية ⇒ لاتينية، مع إزالة فواصل الآلاف ورمز العملة.
 *
 * ما لا نفعله عن قصد: «تصحيح» قيمة ملتبسة. خلية فيها رقمان
 * («12 أو 34») تُعاد كما هي لترفضها القاعدة وتظهر في تقرير الأخطاء،
 * بدل أن نخمّن سعرًا لم يقصده التاجر.
 */
function cleanNumber(value: string): string {
  const normalized = value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.')                  // الفاصلة العشرية العربية
    .replace(/[,٬\s]/g, '');             // فواصل الآلاف والمسافات

  const tokens = normalized.match(/-?\d+(?:\.\d+)?/g) ?? [];
  return tokens.length === 1 ? tokens[0] : normalized.trim();
}

const NUMERIC: ImportField[] = ['price', 'compare_at_price', 'quantity'];

/** يبني صفوف الاستيراد من جدول خام + خريطة الأعمدة. */
export function buildRows(
  table: string[][], mapping: (ImportField | null)[],
): ImportRow[] {
  return table.slice(1).map((cells, i) => {
    const row: ImportRow = { row: i + 2 };   // +2: الترويسة هي الصف 1
    mapping.forEach((field, col) => {
      if (!field) return;
      const raw = (cells[col] ?? '').trim();
      if (raw === '') return;
      row[field] = NUMERIC.includes(field) ? cleanNumber(raw) : raw;
    });
    return row;
  });
}

/** ملف سليم الشكل يجب أن يحمل الحقول الإلزامية. */
export function missingRequired(mapping: (ImportField | null)[]): ImportField[] {
  return (Object.keys(IMPORT_FIELDS) as ImportField[])
    .filter((f) => IMPORT_FIELDS[f].required && !mapping.includes(f));
}
