import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchTerm, ilikeAny, SEARCH_TERM_MAX } from '../src/lib/search.ts';

/**
 * الاختراق يُقاس لا يُفترض: نبني التعبير كما تبنيه الصفحات، ثم نعدّ
 * الفواصل **خارج** علامات الاقتباس. فاصلة واحدة = الشرطان المقصودان؛
 * أكثر من ذلك يعني أن المستخدم أضاف شرطًا ثالثًا من عنده.
 */
function topLevelCommas(filter: string): number {
  const outside = filter.split('"').filter((_, i) => i % 2 === 0).join('');
  return (outside.match(/,/g) ?? []).length;
}

const BREAKOUTS = [
  '"%,store_id.neq.00000000-0000-0000-0000-000000000000,name.ilike."%',
  '%",cost_price.gte.0,name.ilike."%',
  'x"),or(cost_price.gte.0',
  '%",deleted_at.not.is.null,name.ilike."%',
  "'; drop table products; --",
  'a*b(c)d,e"f\\g',
];

test('حروف صيغة PostgREST لا تخرج من الاقتباس', () => {
  for (const raw of BREAKOUTS) {
    const filter = ilikeAny(searchTerm(raw), ['name', 'description']);
    assert.ok(filter, `توقّعنا تعبيرًا لـ ${raw}`);
    assert.equal(topLevelCommas(filter), 1, `اختراق عبر: ${raw}`);
    for (const ch of ['"', '(', ')', '*', '\\', "'"]) {
      assert.ok(!searchTerm(raw).includes(ch), `بقي الحرف ${ch} في: ${raw}`);
    }
  }
});

test('الطول محدود دائمًا — لا صفحة بلا حدّ', () => {
  const long = 'ن'.repeat(5000);
  assert.equal(searchTerm(long).length, SEARCH_TERM_MAX);
  assert.equal(searchTerm(long, 20).length, 20);
});

test('الفراغات تُقصّ قبل الحدّ فلا تبتلع نص المستخدم', () => {
  // الحشو لا يُحتسب من الحدّ: من لصق نصًا محشوًّا يبحث عن نصّه كاملًا
  assert.equal(searchTerm(' '.repeat(5000) + 'نيل'), 'نيل');
  // لكن الحدّ يبقى نافذًا على النص الفعلي مهما سبقه حشو
  assert.equal(searchTerm(' '.repeat(5000) + 'ن'.repeat(5000)).length,
               SEARCH_TERM_MAX);
});

test('المدخل غير النصّي يعيد فراغًا لا يرمي', () => {
  for (const bad of [undefined, null, 42, ['a'], {}]) {
    assert.equal(searchTerm(bad), '');
  }
  assert.equal(ilikeAny('', ['name']), null);
});

test('النص العربي يمرّ كما هو', () => {
  assert.equal(searchTerm('  قميص   قطن  '), 'قميص قطن');
  assert.equal(ilikeAny('قميص', ['name', 'sku']),
               'name.ilike."%قميص%",sku.ilike."%قميص%"');
});
