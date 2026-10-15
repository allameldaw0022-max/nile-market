import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CALLBACK_ACTIONS,
  MAX_CALLBACK_BYTES,
  MAX_TELEGRAM_BODY,
  buildCallbackData,
  buildDraftMessage,
  buildEscalationMessage,
  escapeHtml,
  parseCallbackData,
  parseUpdate,
} from '../supabase/functions/_shared/telegram-update.ts';

/**
 * ═══════════════════════════════════════════════════════════════════
 * بوت صاحب المنصّة — المرحلة ٥.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ★★★ ما يحرسه: جسم التحديث يأتي من الإنترنت. ومن يعرف رابط الدالّة
 * يرسل أي شكل. فالجدران ثلاثة — سرٌّ في الترويسة، ومحادثةُ صاحب
 * المنصّة **وضاغطُها**، وفعلٌ من اثنين بمعرّف UUID — وكلٌّ منها
 * محروس، لأنّ سقوط أيٍّ منها لا يرفع خطأً: يجعل الزرّ يعمل لغريب.
 */

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const stripComments = (code: string) => code
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const HOOK = 'supabase/functions/telegram-webhook/index.ts';
const AGENT = 'supabase/functions/support-agent/index.ts';

const OWNER = '123456789';
const OTHER = '987654321';
const LOG = '33333333-3333-4333-8333-333333333333';

const callbackUpdate = (over: Record<string, unknown> = {}) => ({
  callback_query: {
    id: 'cb-1',
    data: `send:${LOG}`,
    from: { id: Number(OWNER) },
    message: { message_id: 42, chat: { id: Number(OWNER) } },
    ...over,
  },
});

// ═══════════════════════════════════════════════════════════════════
// ١) من يُطاع
// ═══════════════════════════════════════════════════════════════════

test('ضغطة صاحب المنصّة في محادثته تُقبل', () => {
  const event = parseUpdate(callbackUpdate(), OWNER);
  assert.equal(event.kind, 'callback');
  assert.deepEqual(
    { action: (event as { action: string }).action, logId: (event as { logId: string }).logId },
    { action: 'send', logId: LOG },
  );
});

test('المحادثة والضاغط يُفحصان معًا', () => {
  // ★★★ في مجموعةٍ تكون المحادثة واحدة وأعضاؤها كثيرين: من أضاف البوت
  //    إلى مجموعةٍ فيها صاحب المنصّة صار قادرًا على الضغط لو فُحصت
  //    المحادثة وحدها.
  const fromStranger = parseUpdate(
    callbackUpdate({ from: { id: Number(OTHER) } }),
    OWNER,
  );
  assert.equal(fromStranger.kind, 'ignore', 'غريبٌ ضغط في محادثة المالك فمرّ');

  const otherChat = parseUpdate(
    callbackUpdate({ message: { message_id: 42, chat: { id: Number(OTHER) } } }),
    OWNER,
  );
  assert.equal(otherChat.kind, 'ignore', 'محادثة أخرى مرّت');
});

test('رسالةٌ من غير المالك تُتجاهل، وأمره يُقبل', () => {
  assert.equal(
    parseUpdate({ message: { text: '/help', chat: { id: Number(OTHER) } } }, OWNER).kind,
    'ignore',
  );
  const command = parseUpdate({ message: { text: ' /help ', chat: { id: Number(OWNER) } } }, OWNER);
  assert.equal(command.kind, 'command');
  assert.equal((command as { text: string }).text, '/help');
  // كلامٌ عاديّ ليس أمرًا — لا نردّ على كل جملة.
  assert.equal(
    parseUpdate({ message: { text: 'مرحبا', chat: { id: Number(OWNER) } } }, OWNER).kind,
    'ignore',
  );
});

test('تحديثٌ لا نعرفه يُتجاهل ولا ينهار', () => {
  for (const body of [{}, null, 'نصّ', { edited_message: {} }, { callback_query: {} }]) {
    const event = parseUpdate(body, OWNER);
    assert.equal(event.kind, 'ignore', JSON.stringify(body));
    assert.ok((event as { reason: string }).reason.length > 0, 'تجاهل بلا سبب');
  }
});

// ═══════════════════════════════════════════════════════════════════
// ٢) بيانات الزرّ
// ═══════════════════════════════════════════════════════════════════

test('الفعل من اثنين، والمعرّف UUID، ولا شيء غيرهما', () => {
  assert.deepEqual(parseCallbackData(`skip:${LOG}`), { action: 'skip', logId: LOG });
  for (const bad of [
    null, 42, '', 'send', `send:${LOG}:extra`, `delete:${LOG}`,
    'send:not-a-uuid', `send:${LOG.slice(0, -1)}`,
    // ★★★ لا يُمرَّر نصٌّ إلى استعلام: المعرّف يُركَّب في مُرشِّح
    //    PostgREST، فحقنٌ هنا يُقرأ صفوفًا أخرى.
    `send:${LOG}&status=eq.sent`, "send:' or 1=1--",
  ]) {
    assert.equal(parseCallbackData(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual([...CALLBACK_ACTIONS], ['send', 'skip']);
});

test('بيانات الزرّ تحت حدّ تلغرام، والتجاوز يُرفَض الآن', () => {
  const data = buildCallbackData('send', LOG);
  assert.ok(new TextEncoder().encode(data).length <= MAX_CALLBACK_BYTES, data);
  assert.deepEqual(parseCallbackData(data), { action: 'send', logId: LOG });
  // ★ تجاوزُ الحدّ يجعل تلغرام يرفض الرسالة كلّها فتضيع المسوّدة بلا
  //   زرّ — فيُكشف عند البناء لا عند الإرسال.
  assert.throws(() => buildCallbackData('send', 'x'.repeat(80)), /CALLBACK_DATA_TOO_LONG/);
});

// ═══════════════════════════════════════════════════════════════════
// ٣) تهريب HTML — وإلا ضاعت المسوّدة
// ═══════════════════════════════════════════════════════════════════

test('نصّ النموذج والتاجر يُهرَّب', () => {
  // ★★★ تلغرام بـparse_mode: HTML يرفض الرسالة كلّها عند وسمٍ غير
  //    مغلق. ومسوّدةٌ فيها «السعر < 100» تضيع بلا زرّ ولا سبب مفهوم.
  assert.equal(escapeHtml('السعر < 100 & > 50'), 'السعر &lt; 100 &amp; &gt; 50');
  const { text } = buildDraftMessage({
    ticketNumber: 'NM-1', subject: 'س < ١', category: 'technical', confidence: 0.8,
    draft: 'اضبط <b>الكمّية</b> & احفظ', logId: LOG, ticketUrl: 'https://x/y',
  });
  assert.ok(!text.includes('<b>الكمّية</b>'), 'وسم من النموذج مرّ كما هو');
  assert.ok(text.includes('&lt;b&gt;الكمّية'), 'لم يُهرَّب وسم النموذج');
  assert.ok(text.includes('س &lt; ١'), 'لم يُهرَّب موضوع التذكرة');
  // ووسومنا نحن باقية — وإلا ظهرت للمستخدم حرفيًّا.
  assert.ok(text.includes('<b>مسوّدة ردّ'), 'وسومنا هُرِّبت');
  assert.ok(text.includes('<pre>'), 'المسوّدة بلا كتلة نصّ');
});

test('المسوّدة الطويلة تُقتطع تحت حدّ الرسالة', () => {
  const { text } = buildDraftMessage({
    ticketNumber: 'NM-1', subject: 'س', category: 'other', confidence: 0.5,
    draft: 'ا'.repeat(10_000), logId: LOG, ticketUrl: 'https://x/y',
  });
  assert.ok(text.length < 4096, `الرسالة أطول من حدّ تلغرام: ${text.length}`);
  assert.ok(MAX_TELEGRAM_BODY < 4096);
});

test('رسالة التحويل تحمل السبب والرابط', () => {
  const text = buildEscalationMessage({
    ticketNumber: 'NM-9', subject: 'موضوع', reason: 'أولوية عاجلة',
    ticketUrl: 'https://nilemarket.online/admin/support/abc',
  });
  assert.ok(text.includes('NM-9') && text.includes('أولوية عاجلة'));
  assert.ok(text.includes('/admin/support/abc'), 'بلا رابط التذكرة');
});

test('الأزرار اثنان: أرسل ولا ترسل', () => {
  const { keyboard } = buildDraftMessage({
    ticketNumber: 'NM-1', subject: 'س', category: 'other', confidence: 0.5,
    draft: 'جواب', logId: LOG, ticketUrl: 'https://x/y',
  });
  const row = keyboard.inline_keyboard[0];
  assert.equal(row.length, 2);
  assert.deepEqual(row.map((b) => parseCallbackData(b.callback_data)), [
    { action: 'send', logId: LOG },
    { action: 'skip', logId: LOG },
  ]);
});

// ═══════════════════════════════════════════════════════════════════
// ٤) حوارس بنيوية على الـwebhook
// ═══════════════════════════════════════════════════════════════════

test('كل جواب لتلغرام ناجح — ولو تجاهلنا أو فشلنا', () => {
  // ★★★ تلغرام يُعيد المحاولة على أي جواب غير ناجح، ويُعطّل الـwebhook
  //    إن تكرّر الفشل. فجوابُ 500 على عطلٍ عندنا يُسكت البوت كلّه.
  const code = stripComments(read(HOOK));
  const serve = code.match(/Deno\.serve\(async \(request\) => \{([\s\S]*?)\n\}\);/)?.[1];
  assert.ok(serve, 'لم أجد جسم المعالج');
  assert.match(serve.trimStart(), /^try\s*\{/);
  const caught = serve.match(/catch\s*\(error\)\s*\{([\s\S]*)$/)?.[1];
  assert.ok(caught);
  assert.match(caught, /reference\s*=\s*crypto\.randomUUID\(\)/, 'فشل بلا رمز ارتباط');
  assert.match(caught, /jsonResponse\(\{\s*ok:\s*true/, 'الفشل يُعلَن لتلغرام فيُعيد المحاولة');
  assert.ok(!/jsonResponse\([^)]*,\s*5\d\d\)/.test(caught), 'جواب 5xx لتلغرام');
});

test('«أرسل» مطالبةٌ ذرّية بشرط `pending`', () => {
  // ★★★ ضغطتان (إصبعٌ مرتعش، أو شبكةٌ أعادت التحديث) تُنتجان ردّين
  //    للتاجر. والشرط في المُرشِّح هو ما يمنع الثانية.
  const code = stripComments(read(HOOK));
  const claim = code.match(/const claimed = await rest\.patch<[^>]*>\([\s\S]*?\n\s*\);/)?.[0];
  assert.ok(claim, 'لم أجد مطالبة «أرسل»');
  assert.match(claim, /status=eq\.pending/, 'المطالبة بلا شرط الحالة');
  assert.match(claim, /status: 'sent'/, 'المطالبة لا تُغلق الصفّ');
  assert.match(code, /if \(!claimed\.length\)[\s\S]{0,200}?answerCallback/, 'صفر صفوف لا يوقف الإرسال');

  // والنقل قبل النداء: لو أُرسل أوّلًا ثم سقط التحديث لأُرسل ثانيةً.
  const claimAt = code.indexOf('const claimed = await rest.patch');
  const replyAt = code.search(/rest\.rpc<[^>]*>\(\s*\n?\s*'ai_support_reply'/);
  assert.ok(replyAt > 0, 'لا نداء لدالّة الردّ');
  assert.ok(claimAt < replyAt, 'الإرسال قبل المطالبة');
});

test('«لا ترسل» كذلك مشروطة بـ`pending`', () => {
  const code = stripComments(read(HOOK));
  const decline = code.match(/const declined = await rest\.patch<[^>]*>\([\s\S]*?\n\s*\);/)?.[0];
  assert.ok(decline, 'لم أجد مسار المنع');
  assert.match(decline, /status=eq\.pending/);
  assert.match(decline, /status: 'declined'/);
});

test('مسوّدة فارغة لا تُرسل ولا تعود `pending`', () => {
  // ★ لو أُعيدت إلى `pending` لدارت الضغطة أبدًا بلا نتيجة.
  const code = stripComments(read(HOOK));
  const block = code.match(/if \(!draft\) \{([\s\S]*?)\n {2}\}/)?.[1];
  assert.ok(block, 'لا حارس للمسوّدة الفارغة');
  assert.match(block, /status: 'failed'/);
  assert.match(block, /EMPTY_DRAFT/);
  assert.ok(!/status: 'pending'/.test(block), 'المسوّدة الفارغة تعود pending');
});

test('كل ضغطة يُردّ عليها — ولو بالرفض', () => {
  // ★★ بلا `answerCallbackQuery` تبقى الساعة تدور على الزرّ حتى تنتهي
  //    مهلة تلغرام، فيظنّ صاحب المنصّة أنّ الضغطة لم تصل فيضغط ثانية.
  const code = stripComments(read(HOOK));
  const returns = code.match(/return jsonResponse\(\{ ok: true, handled: 'send'[\s\S]{0,80}?\)/g) ?? [];
  assert.ok(returns.length >= 3, `مخارج «أرسل» أقلّ من المتوقَّع: ${returns.length}`);
  assert.ok(
    (code.match(/answerCallback\(/g) ?? []).length >= 5,
    'بعض المسارات تخرج بلا ردٍّ على الضغطة',
  );
});

test('المسوّدة المُراجَعة تُرسل بلا ذيل الإفصاح', () => {
  // ★★★ صاحب المنصّة قرأها وأرسلها فالكلام كلامه. والإفصاح لوضع
  //    `auto` وحده — حيث لا يقرأها أحد.
  const code = stripComments(read(HOOK));
  assert.match(code, /p_body: draft/, 'الـwebhook لا يرسل نصّ المسوّدة كما هو');
  assert.ok(!/AI_DISCLOSURE|replyBody/.test(code), 'الـwebhook يُلحق إفصاحًا بردٍّ مُراجَع');
  // وفي المساعد: الإفصاح يمرّ بـreplyBody وحدها.
  assert.match(stripComments(read(AGENT)), /replyBody\(answer\.answer, mode\)/);
});

test('جواب تلغرام `ok:false` ليس نجاحًا', () => {
  // ★★★ تلغرام يردّ **200** مع `{"ok":false}` عند خطأٍ منطقيّ — وسمٌ
  //    غير مغلق مثلًا. ففحصُ شفرة HTTP وحدها يَعدّ الرسالة واصلة وهي
  //    مرفوضة، فيُسجَّل تنبيهٌ ناجح لم يره أحد.
  const code = stripComments(read('supabase/functions/_shared/telegram.ts'));
  const call = code.match(/async function call\([\s\S]*?\n\}/)?.[0];
  assert.ok(call, 'لم أجد نداء تلغرام');
  assert.match(call, /"ok":true/, 'نجاح النداء يُقرأ من الشفرة وحدها');
  assert.match(call, /response\.ok && /, 'الشفرة لا تُفحص');
  // ولا يرفع: المنادي يسجّل الفشل ولا يسقط لأجله.
  assert.match(call, /catch \(error\)[\s\S]*?return \{ ok: false/, 'سقوط الشبكة يرفع');
});

test('فشل تلغرام لا يُسقط المساعد ولا يصمت', () => {
  // ★★★ المسوّدة محفوظة قبل التنبيه، فسقوط البوت لا يضيّعها. لكن
  //    تنبيهًا ضائعًا بصمت يُفسَّر «المساعد لم يعمل» فلا يُشخَّص.
  const code = stripComments(read(AGENT));
  const notify = code.match(/async function notifyOwner\([\s\S]*?\n\}/)?.[0];
  assert.ok(notify, 'لا دالّة تنبيه');
  assert.match(notify, /if \(result\.ok\) return;/, 'التنبيه يرفع عند الفشل');
  assert.match(notify, /telegram_notify_failed/, 'الفشل لا يُسجَّل خادميًّا');
  assert.match(notify, /TELEGRAM_FAILED/, 'الفشل لا يُكتب في صفّ السجلّ');
  // ★★★ ولا ترفع إطلاقًا: رفعةٌ هنا تُسقط المعالج إلى مُلتقِطه الأعلى
  //    فيُكتب الصفّ `failed` — ومسوّدةٌ سليمة محفوظة تصير «فشلًا»
  //    لأنّ بوتًا لم يردّ.
  assert.ok(!/\bthrow\b/.test(notify), 'دالّة التنبيه ترفع فتُسقط المساعد');
  assert.match(notify, /Promise<void>/, 'التنبيه يعيد قيمةً يُبنى عليها قرار');
});

test('صفّ السجلّ يُكتب قبل التنبيه', () => {
  // ★★★ لو انعكس الترتيب وسقط التنبيه لبقي الصفّ على ما كان: فيُعاد
  //    نداء المساعد فيُحسب نموذجٌ ثانٍ، أو تبقى المسوّدة بلا نصّ فلا
  //    يجد زرُّ «أرسل» ما يرسله.
  const code = stripComments(read(AGENT));
  const draftBlock = code.match(/if \(decision\.action === 'draft'\) \{([\s\S]*?)\n {4}\}/)?.[1];
  assert.ok(draftBlock, 'لا مسار مسوّدة');
  const finishAt = draftBlock.indexOf('await finish(');
  const notifyAt = draftBlock.indexOf('await notifyOwner(');
  assert.ok(finishAt > -1 && notifyAt > -1, 'مسار المسوّدة ناقص');
  assert.ok(finishAt < notifyAt, 'التنبيه قبل كتابة الصفّ');
});
