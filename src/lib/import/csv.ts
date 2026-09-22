/**
 * محلّل CSV حسب RFC 4180 — بلا اعتماديات.
 *
 * لماذا محلّل خاص؟ ملف الاستيراد مُدخَل مستخدم غير موثوق، وإضافة
 * مكتبة تحليل لها ثغرات معروفة لقراءته مقايضة سيئة. المطلوب هنا
 * محدود وواضح: حقول مقتبسة، فواصل أسطر داخل الحقل، وBOM.
 */

/** يستنتج الفاصل من أول سطر: الفاصلة أو الفاصلة المنقوطة أو Tab. */
export function sniffDelimiter(sample: string): string {
  const line = sample.split(/\r?\n/, 1)[0] ?? '';
  const counts: Array<[string, number]> = [',', ';', '\t'].map((d) => {
    let inQuotes = false;
    let n = 0;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) n += 1;
    }
    return [d, n];
  });
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  // BOM يجعل أول ترويسة لا تُطابق أي اسم عمود
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delim = delimiter ?? sniffDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delim) { endField(); continue; }
    if (ch === '\r') { if (text[i + 1] === '\n') i += 1; endRow(); continue; }
    if (ch === '\n') { endRow(); continue; }
    field += ch;
  }

  // السطر الأخير بلا فاصل أسطر
  if (field !== '' || row.length > 0) endRow();

  // أسطر فارغة تمامًا تُهمَل (شائعة في نهاية الملف)
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** يحوّل صفوفًا إلى نص CSV صالحًا للتصدير. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /["\n\r,;\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM حتى يفتح Excel العربية بترميز صحيح
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
