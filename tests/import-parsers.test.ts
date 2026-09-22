import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, sniffDelimiter, toCsv } from '../src/lib/import/csv.ts';
import { buildRows, mapHeaders, missingRequired } from '../src/lib/import/columns.ts';

test('CSV: حقول مقتبسة وفواصل داخلها', () => {
  const rows = parseCsv('name,price\n"قميص, قطن",20000\n');
  assert.deepEqual(rows, [['name', 'price'], ['قميص, قطن', '20000']]);
});

test('CSV: اقتباس مزدوج داخل الحقل', () => {
  const rows = parseCsv('a\n"قال ""مرحبًا"""\n');
  assert.deepEqual(rows[1], ['قال "مرحبًا"']);
});

test('CSV: سطر داخل حقل مقتبس لا يقسم الصف', () => {
  const rows = parseCsv('a,b\n"سطر\nثانٍ",2\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ['سطر\nثانٍ', '2']);
});

test('CSV: BOM لا يُفسد أول ترويسة', () => {
  const rows = parseCsv('﻿name,price\nس,1\n');
  assert.equal(rows[0][0], 'name');
});

test('CSV: CRLF وأسطر فارغة في النهاية', () => {
  const rows = parseCsv('a,b\r\n1,2\r\n\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
});

test('CSV: استنتاج الفاصلة المنقوطة (تصدير Excel العربي)', () => {
  assert.equal(sniffDelimiter('الاسم;السعر;الكمية'), ';');
  assert.equal(sniffDelimiter('name,price'), ',');
  // فاصلة داخل حقل مقتبس لا تُحسب
  assert.equal(sniffDelimiter('"أ;ب";ج'), ';');
});

test('CSV: التصدير يقتبس ما يحتاج اقتباسًا ويبدأ بـBOM', () => {
  const csv = toCsv([['اسم', 'سعر'], ['قميص, قطن', 20000]]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"قميص, قطن"'));
});

test('الأعمدة: مطابقة ترويسات عربية وإنجليزية', () => {
  const map = mapHeaders(['اسم المنتج', 'سعر البيع', 'الكمية', 'عمود غريب']);
  assert.deepEqual(map, ['name', 'price', 'quantity', null]);
});

test('الأعمدة: المطابقة تتجاهل التشكيل وصور الألف والهاء', () => {
  assert.deepEqual(mapHeaders(['الإسم', 'السِعر']), ['name', 'price']);
});

test('الأعمدة: الحقل لا يُربط بعمودين', () => {
  const map = mapHeaders(['price', 'السعر']);
  assert.deepEqual(map, ['price', null]);
});

test('الأعمدة: نقص حقل إلزامي يُكتشف', () => {
  assert.deepEqual(missingRequired(mapHeaders(['اسم المنتج'])), ['price']);
  assert.deepEqual(missingRequired(mapHeaders(['اسم المنتج', 'السعر'])), []);
});

test('الصفوف: أرقام عربية-هندية وفواصل آلاف ورمز عملة تُنقّى', () => {
  const table = [
    ['اسم المنتج', 'السعر', 'الكمية'],
    ['قميص', '٢٠٬٠٠٠ ج.س', '١٥'],
    ['حزام', '7,500', '8'],
  ];
  const rows = buildRows(table, mapHeaders(table[0]));
  assert.equal(rows[0].price, '20000');
  assert.equal(rows[0].quantity, '15');
  assert.equal(rows[1].price, '7500');
});

test('الصفوف: رقم الصف يطابق رقمه في الملف', () => {
  const table = [['اسم المنتج', 'السعر'], ['أ', '1'], ['ب', '2']];
  const rows = buildRows(table, mapHeaders(table[0]));
  assert.equal(rows[0].row, 2);
  assert.equal(rows[1].row, 3);
});

test('الصفوف: الخلايا الفارغة لا تُرسَل كنص فارغ', () => {
  const table = [['اسم المنتج', 'السعر', 'رمز المنتج'], ['أ', '1', '  ']];
  const rows = buildRows(table, mapHeaders(table[0]));
  assert.equal('sku' in rows[0], false);
});

test('الصفوف: الأعمدة غير المربوطة تُهمَل', () => {
  const table = [['اسم المنتج', 'السعر', 'ملاحظات'], ['أ', '1', 'أي شيء']];
  const rows = buildRows(table, mapHeaders(table[0]));
  assert.deepEqual(Object.keys(rows[0]).sort(), ['name', 'price', 'row']);
});

test('الصفوف: خلية فيها رقمان تُعاد كما هي لترفضها القاعدة', () => {
  const table = [['اسم المنتج', 'السعر'], ['أ', '12 أو 34']];
  const rows = buildRows(table, mapHeaders(table[0]));
  assert.equal(rows[0].price, '12أو34');
});

test('الصفوف: سعر عشري يُحفظ بفاصلته', () => {
  const table = [['اسم المنتج', 'السعر'], ['أ', '12.50 ج.س']];
  const rows = buildRows(table, mapHeaders(table[0]));
  assert.equal(rows[0].price, '12.50');
});
