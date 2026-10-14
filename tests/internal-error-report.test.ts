import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, errors, fromPostgres } from '../src/lib/authz/errors.ts';
import { actionError } from '../src/lib/action-result.ts';

/**
 * ═══════════════════════════════════════════════════════════════════
 * «تم إبلاغ الفريق» يجب أن تكون صادقة.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ★★★ العطل الذي يحرسه: `fromPostgres` كانت تُنتج `AppError('INTERNAL')`
 * و`actionError` تسجّل ما **ليس** `AppError` وحده ⇒ كل خطأ قاعدة غير
 * معروف يختفي بلا سطرٍ واحد في أي سجلّ. فبقي عطلٌ أوقف ميزةً كاملة
 * (أكواد الخصم) شهرًا بلا أن يعرف به أحد، ولم يُشخَّص إلا من شكوى
 * تاجر — ثم تعذّر تشخيص عطلٍ ثانٍ لأن لا أثر له.
 *
 * ★★ والشرطان متلازمان: سجلٌّ بلا رمزٍ يراه المستخدم لا يُوصَل بشكواه،
 * ورمزٌ بلا سجلّ لا يدلّ على شيء. فالاختبار يفحص الوصلة لا طرفيها.
 */

/** يلتقط ما يُكتب في `console.error` — مخرج `log.error`. */
function captureErrorLog<T>(fn: () => T): { result: T; lines: string[] } {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try {
    return { result: fn(), lines };
  } finally {
    console.error = original;
  }
}

const CODE_RE = /[0-9a-f]{8}/;

test('★★★ خطأ قاعدة غير معروف يُسجَّل — ولا يختفي', () => {
  const { result, lines } = captureErrorLog(() =>
    fromPostgres({ code: '42P01', message: 'relation "coupons_v2" does not exist' }));

  assert.equal(result.code, 'INTERNAL');
  assert.equal(lines.length, 1, 'سطر سجلّ واحد — لا صمت ولا تكرار');

  const entry = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(entry.level, 'error');
  assert.equal(entry.event, 'internal_error');
  assert.equal(entry.pg_code, '42P01', 'رمز الخطأ من Postgres يصل السجلّ');
  assert.match(String(entry.pg_message), /coupons_v2/, 'ونصّه كذلك — هو ما يشخّص العطل');
  assert.ok(entry.at, 'ومن أين جاء');
});

test('★★★ والرمز نفسه يظهر للمستخدم — هو الوصلة بين شكواه والسجلّ', () => {
  const { result, lines } = captureErrorLog(() =>
    fromPostgres({ code: 'XX000', message: 'boom' }));

  const logged = (JSON.parse(lines[0]) as { correlation_id: string }).correlation_id;
  assert.match(logged, CODE_RE, 'الرمز في السجلّ');
  assert.ok(result.message.includes(logged),
    `الرمز لا يظهر في رسالة المستخدم: «${result.message}»`);
  assert.equal(result.details?.correlationId, logged);
});

test('★★ ولا يُسرَّب نصّ القاعدة إلى المستخدم', () => {
  const { result } = captureErrorLog(() => fromPostgres({
    code: 'XX000',
    message: 'duplicate key value violates unique constraint "customers_phone_key"',
  }));
  assert.ok(!/customers_phone_key|duplicate key/.test(result.message),
    'تفصيل القاعدة ظهر للمستخدم');
});

test('★ وأخطاؤنا المعروفة لا تُسجَّل ولا تأخذ رمزًا', () => {
  const cases: { code?: string; message: string }[] = [
    { message: 'LIMIT_EXCEEDED:coupons.max_active:10:10' },
    { message: 'VALIDATION: قيمة الخصم يجب أن تكون أكبر من صفر' },
    { message: 'SUBSCRIPTION_INACTIVE: اشتراك المتجر غير نشط' },
    { code: '42501', message: 'FORBIDDEN' },
    { code: '23505', message: 'duplicate key' },
  ];
  for (const c of cases) {
    const { result, lines } = captureErrorLog(() => fromPostgres(c));
    assert.notEqual(result.code, 'INTERNAL', `«${c.message}» صار خطأً داخليًّا`);
    assert.deepEqual(lines, [], `«${c.message}» ضجيجٌ في السجلّ بلا داعٍ`);
  }
});

test('★★ واستثناءٌ ليس من أخطائنا يُسجَّل كذلك — لا يبتلعه actionError', () => {
  const { result, lines } = captureErrorLog(() =>
    actionError(new TypeError('Cannot read properties of undefined')));

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'INTERNAL');
  assert.equal(lines.length, 1, 'الاستثناء غير المتوقّع بلا سجلّ');

  const entry = JSON.parse(lines[0]) as { correlation_id: string; reason: string };
  assert.equal(entry.reason, 'TypeError');
  assert.ok(result.message.includes(entry.correlation_id));
  assert.ok(!result.message.includes('Cannot read properties'),
    'نصّ الاستثناء ظهر للمستخدم');
});

test('★ وخطأٌ من أخطائنا يمرّ كما هو بلا سجلّ ولا رمز', () => {
  const { result, lines } = captureErrorLog(() =>
    actionError(new AppError('VALIDATION_ERROR', 'اسم المنتج مطلوب', { field: 'name' })));

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.message, 'اسم المنتج مطلوب');
  assert.equal(result.field, 'name');
  assert.deepEqual(lines, [], 'خطأ تحقّقٍ عاديّ لا مكان له في سجلّ الأخطاء');
});

test('★★ و`errors.internal` المباشرة تُسجَّل هي الأخرى', () => {
  // `if (!row) throw errors.internal()` منتشرة في كل الأفعال: دالّة
  // قاعدة أعادت لا شيء حيث يجب أن تعيد صفًّا — حالةٌ تستحقّ أثرًا.
  const { result, lines } = captureErrorLog(() =>
    errors.internal({ what: 'rpc_returned_no_row' }));

  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]) as { what: string; correlation_id: string };
  assert.equal(entry.what, 'rpc_returned_no_row');
  assert.ok(result.message.includes(entry.correlation_id));
});

test('★ والرموز لا تتكرّر بين خطأين', () => {
  const { lines } = captureErrorLog(() => {
    fromPostgres({ code: 'XX000', message: 'a' });
    fromPostgres({ code: 'XX000', message: 'b' });
  });
  const ids = lines.map((l) => (JSON.parse(l) as { correlation_id: string }).correlation_id);
  assert.notEqual(ids[0], ids[1], 'رمزٌ ثابت لا يميّز شكوى عن أخرى');
});

// ═══════════════════════════════════════════════════════════════════
// أخطاء الإدخال ليست أعطال نظام
// ═══════════════════════════════════════════════════════════════════

/**
 * ★★★ العطل الذي يحرسه: تاجرٌ أدخل رقمًا أكبر من سعة عموده، فرفع
 * Postgres `22003 numeric field overflow`. والرمز غير مترجَم، فسقط
 * إلى «حدث خطأ غير متوقع، تم إبلاغ الفريق» — فأعاد التاجر المحاولة
 * بالقيمة نفسها أربع مرّات في خمس ساعات، ثم فتح تذكرة.
 *
 * خطأُ إدخالٍ يُعرض كعطلِ نظام يُبقي المستخدم عاجزًا: لا يعرف أنّ
 * بيده إصلاحه.
 */
test('★★★ خطأ إدخال من القاعدة يُترجَم ولا يُعرض كعطل نظام', () => {
  const cases: [string, RegExp][] = [
    ['22003', /كبير جدًا/],       // رقم أكبر من عموده
    ['22P02', /غير صالحة/],       // نصّ في موضع رقم
    ['22001', /طويل جدًا/],        // نصّ أطول من عموده
    ['23514', /غير مقبولة/],      // مخالفة قيد
  ];
  for (const [code, expected] of cases) {
    const { result, lines } = captureErrorLog(() =>
      fromPostgres({ code, message: 'numeric field overflow' }));
    assert.equal(result.code, 'VALIDATION_ERROR',
      `${code} ما زال يُعرض كعطل نظام — التاجر لا يعرف أن بيده إصلاحه`);
    assert.match(result.message, expected);
    assert.deepEqual(lines, [], `${code} خطأ مستخدم لا يستحقّ سطرًا في سجلّ الأعطال`);
  }
});
