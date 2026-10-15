import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { chunkMarkdown, contentHash } from '../supabase/functions/_shared/chunk.ts';
import { planIngest } from '../supabase/functions/_shared/kb-plan.ts';
import { ALLOWED_TABLES } from '../supabase/functions/_shared/db.ts';
import {
  buildGeminiRequest,
  normalize,
  parseGeminiResponse,
  toVectorLiteral,
  type EmbeddingConfig,
} from '../supabase/functions/_shared/embeddings.ts';

/**
 * ═══════════════════════════════════════════════════════════════════
 * مساعد الدعم — المرحلة ٣: تقطيع المعرفة وفهرستها.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ★★★ ما يحرسه هذا الملفّ ليس «هل يعمل الكود» بل أربعة أعطالٍ تصمت:
 *  ١) حذفٌ قبل إدراجٍ ناجح ⇒ قاعدة معرفةٍ فارغة ومساعدٌ أبكم.
 *  ٢) إعادة حساب متجهٍ لمقطعٍ لم يتغيّر ⇒ مالٌ يُدفع في كل فهرسة.
 *  ٣) `taskType` واحدٌ للمستند والسؤال ⇒ استرجاعٌ أضعف بلا خطأ.
 *  ٤) جدولٌ فيه بيانات تجّار يتسلّل إلى مسار المساعد (القاعدة ٥).
 * وكلّها تنجح ظاهريًّا — فلا يكشفها إلا حارس.
 */

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');

const stripComments = (code: string) => code
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

function functionFiles(dir = 'supabase/functions/', out: string[] = []): string[] {
  for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true })) {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) functionFiles(`${path}/`, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

const KB = 'docs/support-knowledge-base.md';
const INGEST = 'supabase/functions/support-kb-ingest/index.ts';

/**
 * موضع نداءٍ في الكود، مع السماح بوسيط نوعٍ (`rest.remove<{…}>(`).
 *
 * ★★ ولماذا يرفع عند الغياب: `indexOf` يعيد −١، و−١ أصغر من كل موضع
 *    ⇒ نداءٌ **محذوف** يجعل كل تأكيد «قبل» ينجح. فالغياب خطأٌ معلَن
 *    لا صفرٌ صامت.
 */
function callIndex(code: string, call: string): number {
  const match = new RegExp(`${call.replace(/\./g, '\\.')}(?:<[^>]*>)?\\(`).exec(code);
  assert.ok(match, `نداء غائب: ${call}`);
  return match.index;
}

// ═══════════════════════════════════════════════════════════════════
// ١) التقطيع يحفظ المعنى
// ═══════════════════════════════════════════════════════════════════

test('كل مقطع يحمل عنوان قسمه في رأسه', () => {
  const chunks = chunkMarkdown(read(KB));
  assert.ok(chunks.length > 0, 'لا مقاطع');
  for (const chunk of chunks) {
    assert.ok(
      chunk.content.startsWith(`## ${chunk.section}`),
      // ★ بلا العنوان يصير متجه مقطعٍ من «رسائل الخطأ» قريبًا من مقطع
      //   «حدود النظام»: كلاهما جداول أرقامٍ بلا موضوع.
      `مقطع بلا عنوان قسمه: ${chunk.section}`,
    );
    assert.ok(chunk.words > 0 && chunk.content.trim().length > 0);
  }
});

test('كل قسم `##` في ملفّ المعرفة ممثَّل بمقطع واحد على الأقل', () => {
  const markdown = read(KB);
  const headings = [...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  const sections = new Set(chunkMarkdown(markdown).map((c) => c.section));
  assert.ok(headings.length >= 15, `أقسام الملفّ قليلة: ${headings.length}`);
  for (const heading of headings) {
    assert.ok(sections.has(heading), `قسم ضائع من الفهرسة: ${heading}`);
  }
});

test('لا مقطع أصغر من أن يُجيب ولا أكبر من أن يدلّ', () => {
  const chunks = chunkMarkdown(read(KB));
  // ★★ الحدّ الأعلى مُعايَر: بـ٨٠٠ كلمة صار قسم «أسئلة شائعة» (٣٨
  //    سؤالًا) متجهًا واحدًا. فمقطعٌ يتجاوز ٤٠٠ كلمة يعني أنّ
  //    المعايرة انفكّت، أو أنّ كتلةً واحدة بلا فقراتٍ كبرت أكثر مما
  //    يجوز في الملفّ نفسه.
  for (const chunk of chunks) {
    assert.ok(chunk.words <= 400, `مقطع ضخم (${chunk.words} كلمة): ${chunk.section}`);
  }
  assert.ok(chunks.length >= 20, `المقاطع أقلّ من المتوقَّع: ${chunks.length}`);
});

test('القسم الأكبر من الحدّ يُقسَم ويبقى كل جزء معنونًا', () => {
  const long = Array.from({ length: 12 }, (_, i) =>
    `### بند ${i}\n\n${Array.from({ length: 40 }, (_, w) => `كلمة${w}`).join(' ')}`).join('\n\n');
  const chunks = chunkMarkdown(`# عنوان\n\n## قسم طويل\n\n${long}\n`);
  assert.ok(chunks.length > 1, 'لم يُقسَم قسمٌ يتجاوز الحدّ أضعافًا');
  for (const chunk of chunks) {
    assert.equal(chunk.section, 'قسم طويل');
    assert.ok(chunk.content.startsWith('## قسم طويل'));
  }
});

test('ما قبل أوّل `##` ليس مقطعًا', () => {
  const chunks = chunkMarkdown('# العنوان الرئيس\n\nمقدّمة لا تنتمي لقسم.\n\n## قسم\n\nجسم القسم.\n');
  assert.deepEqual(chunks.map((c) => c.section), ['قسم']);
});

// ═══════════════════════════════════════════════════════════════════
// ٢) البصمة: لا متجه يُحسب مرّتين
// ═══════════════════════════════════════════════════════════════════

test('البصمة ثابتة، وتتجاهل الفراغ، وتتغيّر بتغيّر المعنى', async () => {
  const a = await contentHash('## قسم\n\nنصّ المقطع');
  assert.equal(a, await contentHash('## قسم\n\nنصّ المقطع'), 'بصمة غير ثابتة');
  assert.equal(a, await contentHash('## قسم\n   نصّ   المقطع  '), 'الفراغ غيّر البصمة');
  assert.notEqual(a, await contentHash('## قسم\n\nنصّ المقطعة'), 'حرفٌ لم يغيّر البصمة');
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('المقطع الذي لم يتغيّر لا يُعاد حساب متجهه', async () => {
  const markdown = read(KB);
  const all = await planIngest(markdown, []);
  assert.equal(all.toEmbed.length, all.chunks.length, 'قاعدة فارغة ⇒ الكلّ جديد');
  assert.equal(all.staleHashes.length, 0);

  const existing = all.chunks.map((chunk, i) => ({ id: `id-${i}`, content_hash: chunk.contentHash }));
  const again = await planIngest(markdown, existing);
  // ★★★ هذا هو الحارس المالي: فهرسةٌ ثانية بلا تغييرٍ تكلّف صفرًا.
  assert.equal(again.toEmbed.length, 0, `أعاد حساب ${again.toEmbed.length} متجهًا بلا تغيير`);
  assert.equal(again.staleHashes.length, 0, 'حذفٌ بلا تغيير');
  assert.equal(again.chunks.length, all.chunks.length);
});

test('المقطع المعدَّل وحده يُحسب، والقديم يُعلَن للحذف', async () => {
  const markdown = read(KB);
  const base = await planIngest(markdown, []);
  const existing = base.chunks.map((chunk, i) => ({ id: `id-${i}`, content_hash: chunk.contentHash }));

  const edited = `${markdown}\n\nسطرٌ أُضيف في آخر قسم.\n`;
  const plan = await planIngest(edited, existing);
  assert.equal(plan.toEmbed.length, 1, `المحسوب ${plan.toEmbed.length} لا ١`);
  assert.equal(plan.staleHashes.length, 1, `المعلَن للحذف ${plan.staleHashes.length} لا ١`);
  assert.ok(!plan.chunks.some((c) => c.contentHash === plan.staleHashes[0]));
});

test('مقطعان ببصمةٍ واحدة يُطويان قبل الإرسال', async () => {
  // ★★ وإلّا ردّ Postgres بـ21000 «on conflict لا تُصيب صفًّا مرّتين» —
  //    خطأٌ لا يدلّ نصُّه على سببه.
  const section = '## قسم مكرَّر\n\nنصٌّ واحد بعينه في موضعين.';
  const plan = await planIngest(`# ع\n\n${section}\n\n${section}\n`, []);
  assert.equal(plan.collapsed, 1, 'لم يُطوَ التكرار');
  const hashes = plan.chunks.map((c) => c.contentHash);
  assert.equal(new Set(hashes).size, hashes.length, 'بصمة مكرَّرة في الدفعة');
});

// ═══════════════════════════════════════════════════════════════════
// ٣) ترتيب الفهرسة: الإدراج قبل الحذف — وإلّا فُرّغت المعرفة
// ═══════════════════════════════════════════════════════════════════

test('دالّة الفهرسة تُدرج قبل أن تحذف', () => {
  const code = stripComments(read(INGEST));
  const upsert = callIndex(code, 'rest.upsert');
  const remove = callIndex(code, 'rest.remove');
  assert.ok(upsert < remove, 'الحذف قبل الإدراج: فشلُ التمثيل يُفرّغ قاعدة المعرفة');
});

test('خطّةٌ بلا مقاطع لا تحذف شيئًا', () => {
  const code = stripComments(read(INGEST));
  const guard = code.search(/if\s*\(!plan\.chunks\.length\)\s*return/);
  assert.ok(guard > 0, 'لا حارس لملفٍّ وصل مبتورًا');
  assert.ok(guard < callIndex(code, 'rest.remove'), 'الحارس بعد الحذف لا قبله');
});

test('`dryRun` يسبق كل كتابةٍ وكل حساب متجه', () => {
  const code = stripComments(read(INGEST));
  const dry = code.search(/if\s*\(dryRun\)\s*return/);
  assert.ok(dry > 0, 'لا مسار تجريبي');
  for (const call of ['embedTexts', 'rest.upsert', 'rest.remove']) {
    assert.ok(dry < callIndex(code, call), `${call} قبل مخرج dryRun`);
  }
});

test('هدف `on conflict` هو عمودا الفهرس الفريد في 0071', () => {
  const code = stripComments(read(INGEST));
  assert.match(code, /'source,content_hash'/, 'هدف التعارض ليس (source, content_hash)');
  const migration = read('supabase/migrations/0071_ai_support_core.sql');
  // ★ الفهرس الفريد هو ما يجعل UPSERT ممكنًا أصلًا؛ وتغييره في الهجرة
  //   وحده يُسقط الفهرسة بـ42P10. فالحارس يقابل الطرفين.
  assert.match(
    migration,
    /create unique index[^;]*support_kb_chunks[^;]*\(\s*source\s*,\s*content_hash\s*\)/,
    'لا فهرس فريد على (source, content_hash)',
  );
});

// ═══════════════════════════════════════════════════════════════════
// ٤) حدود النفاذ: لا جدول خارج قائمةٍ معلَنة
// ═══════════════════════════════════════════════════════════════════

test('قائمة الجداول المسموحة لا تضمّ بيانات تجّار ولا مالًا', () => {
  const forbidden = [
    'orders', 'order_items', 'payments', 'payouts', 'inventory', 'inventory_movements',
    'products', 'product_variants', 'customers', 'stores', 'store_settings',
    'subscriptions', 'invoices', 'bank_accounts', 'partners', 'profiles', 'media',
  ];
  for (const table of ALLOWED_TABLES) {
    assert.ok(
      /^support_/.test(table),
      `جدول خارج نطاق الدعم في القائمة المسموحة: ${table}`,
    );
    assert.ok(!forbidden.includes(table), `جدول محظور في القائمة: ${table}`);
  }
  assert.ok(ALLOWED_TABLES.includes('support_kb_chunks'));
});

test('كل جدول يُنادى في الدوالّ الطرفية مُعلَن في القائمة', () => {
  const allowed = new Set<string>(ALLOWED_TABLES);
  let calls = 0;
  for (const file of functionFiles()) {
    const code = stripComments(read(file));
    for (const match of code.matchAll(/rest\.(?:select|upsert|remove)<[^>]*>?\(\s*'([^']+)'/g)) {
      calls += 1;
      assert.ok(allowed.has(match[1]), `${file}: جدول غير معلَن ${match[1]}`);
    }
    for (const match of code.matchAll(/rest\.(?:select|upsert|remove)\(\s*'([^']+)'/g)) {
      calls += 1;
      assert.ok(allowed.has(match[1]), `${file}: جدول غير معلَن ${match[1]}`);
    }
  }
  assert.ok(calls >= 3, `نداءات القاعدة المفحوصة قليلة: ${calls}`);
});

test('لا طلب PostgREST خارج `_shared/db.ts`', () => {
  // ★★★ بلا هذا الحارس تكفي سطرُ `fetch` واحدة لتجاوز القائمة كلّها.
  for (const file of functionFiles()) {
    if (file.endsWith('_shared/db.ts')) continue;
    assert.ok(
      !stripComments(read(file)).includes('/rest/v1'),
      `${file}: نفاذ مباشر إلى PostgREST يتخطّى قائمة الجداول`,
    );
  }
  assert.ok(stripComments(read('supabase/functions/_shared/db.ts')).includes('/rest/v1'));
});

// ═══════════════════════════════════════════════════════════════════
// ٥) طبقة التمثيل: نوع المهمّة والبعد
// ═══════════════════════════════════════════════════════════════════

const config: EmbeddingConfig = {
  provider: 'gemini',
  model: 'gemini-embedding-001',
  dimensions: 4,
  baseUrl: 'https://example.invalid',
  apiKey: 'unused-in-test',
};

test('نوع المهمّة يختلف بين المستند والسؤال', () => {
  const doc = buildGeminiRequest(['س'], 'document', config).body as
    { requests: { taskType: string; outputDimensionality: number }[] };
  const query = buildGeminiRequest(['س'], 'query', config).body as
    { requests: { taskType: string }[] };
  assert.equal(doc.requests[0].taskType, 'RETRIEVAL_DOCUMENT');
  assert.equal(query.requests[0].taskType, 'RETRIEVAL_QUERY');
  // ★★ توحيدهما لا يرفع خطأً — يُنقص الدقّة وحدها. فالحارس هو الكاشف.
  assert.notEqual(doc.requests[0].taskType, query.requests[0].taskType);
  assert.equal(doc.requests[0].outputDimensionality, 4);
});

test('بعدٌ مخالف للعمود يُرفَض برسالة تسمّي الرقمين', () => {
  const payload = { embeddings: [{ values: [1, 2, 3] }] };
  assert.throws(() => parseGeminiResponse(payload, 1, 4), /EMBEDDING_DIMENSION_MISMATCH/);
  assert.throws(() => parseGeminiResponse({ embeddings: [] }, 1, 4), /EMBEDDING_COUNT_MISMATCH/);
  assert.throws(
    () => parseGeminiResponse({ embeddings: [{ values: [1, 2, null, 4] }] }, 1, 4),
    /EMBEDDING_NOT_NUMERIC/,
  );
});

test('المتجه يُطبَّع، ويُكتب بصيغة pgvector', () => {
  const unit = normalize([3, 4]);
  assert.ok(Math.abs(Math.hypot(...unit) - 1) < 1e-12, 'لم يُطبَّع');
  assert.deepEqual(normalize([0, 0]), [0, 0], 'متجه صفري أسقط التطبيع');
  const parsed = parseGeminiResponse({ embeddings: [{ values: [0, 0, 0, 2] }] }, 1, 4);
  assert.deepEqual(parsed[0], [0, 0, 0, 1]);
  assert.equal(toVectorLiteral([0.5, -0.25]), '[0.5,-0.25]');
});

// ═══════════════════════════════════════════════════════════════════
// ٦) الأسرار: من البيئة وحدها، والمقارنة لا تكشف زمنًا
// ═══════════════════════════════════════════════════════════════════

test('لا سرّ مكتوب في دوالّ الدعم', () => {
  for (const file of functionFiles()) {
    const code = read(file);
    assert.ok(!/AIza[0-9A-Za-z_-]{10,}/.test(code), `${file}: مفتاح Google مكتوب`);
    assert.ok(!/\bsk-[0-9A-Za-z]{16,}/.test(code), `${file}: مفتاح بنمط sk- مكتوب`);
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\./.test(code), `${file}: رمز JWT مكتوب`);
    assert.ok(!/\b\d{8,10}:[A-Za-z0-9_-]{30,}/.test(code), `${file}: رمز بوت تلغرام مكتوب`);
  }
});

test('الأسرار تُقرأ بـ`requireEnv` بلا بديلٍ افتراضي', () => {
  const names = ['GEMINI_API_KEY', 'SUPPORT_INGEST_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'];
  const code = functionFiles().map((f) => stripComments(read(f))).join('\n');
  for (const name of names) {
    assert.ok(code.includes(`'${name}'`), `متغيّر غير مستعمل: ${name}`);
    // ★ `optionalEnv('SECRET', '…')` يجعل الدالّة تعمل بسرٍّ فارغ ⇒ جدارٌ
    //   من ورق. فالسرّ بـrequireEnv وحدها.
    assert.ok(
      !new RegExp(`optionalEnv\\(\\s*'${name}'`).test(code),
      `سرّ له قيمة افتراضية: ${name}`,
    );
  }
  assert.ok(
    /requireEnv\(\s*'GEMINI_API_KEY'\s*\)/.test(code),
    'مفتاح التمثيل لا يُقرأ من البيئة',
  );
});

test('مقارنة السرّ على البصمة لا على النصّ', () => {
  const body = stripComments(read('supabase/functions/_shared/http.ts'))
    .match(/export async function secretMatches[\s\S]*?\n\}/)?.[0];
  assert.ok(body, 'لم أجد دالّة مقارنة السرّ');
  assert.ok(body.includes('digest('), 'المقارنة بلا بصمة ⇒ زمن الردّ يكشف البادئة');
  assert.ok(
    !/provided\s*===\s*expected|expected\s*===\s*provided/.test(body),
    'مقارنة نصّية مباشرة: تتوقّف عند أوّل حرفٍ مختلف فيُخمَّن السرّ',
  );
  assert.ok(/\^/.test(body) && /diff/.test(body), 'لا مقارنة بايتًا بايتًا بزمنٍ ثابت');
});

test('حارس السرّ يعيد جوابًا يُفحص لا قيمةً تُهمَل', async () => {
  const { requireSecret, secretMatches } = await import('../supabase/functions/_shared/http.ts');
  assert.equal(await secretMatches('abc', 'abc'), true);
  assert.equal(await secretMatches('ab', 'abc'), false);
  assert.equal(await secretMatches(null, 'abc'), false);
  assert.equal(await secretMatches('', 'abc'), false);

  const bad = await requireSecret(new Request('https://x/', { method: 'POST' }), 'x-s', 'secret');
  assert.equal(bad?.status, 401);
  const good = await requireSecret(
    new Request('https://x/', { method: 'POST', headers: { 'x-s': 'secret' } }),
    'x-s',
    'secret',
  );
  assert.equal(good, null);
});
