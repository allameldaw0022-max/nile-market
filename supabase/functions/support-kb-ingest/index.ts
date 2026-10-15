/**
 * فهرسة قاعدة معرفة الدعم.
 *
 * الطلب: POST مع ترويسة `x-support-secret` وجسم
 *   { source: "docs/support-knowledge-base.md", markdown: "…", dryRun?: true }
 *
 * ★★★ ترتيب العمليات مقصود: إدراجٌ ناجحٌ **ثم** حذف القديم. لو حُذف
 * أولًا وفشل حساب المتجهات (مفتاح منتهٍ، حدّ معدّل) لبقيت قاعدة
 * المعرفة فارغةً فيردّ المساعد على كل تاجرٍ بلا مرجع — عطلٌ أسوأ من
 * «لم تُحدَّث المعرفة».
 *
 * ★★ و`dryRun` ليس ترفًا: يُظهر الخطّة (عدد المقاطع، أيّها جديد، أيّها
 * يُحذف) بلا حساب متجهٍ ولا كتابةٍ في القاعدة — فتُراجَع المعايرة
 * قبل دفع أي مال أو لمس صفٍّ.
 *
 * ★ والنصّ يُرسَل في الجسم لا يُقرأ من GitHub: فلا رمز وصولٍ لمستودعٍ
 *   خاصّ داخل الدالّة، ولا نفاذ شبكيّ زائد.
 */

import { requireEnv } from '../_shared/env.ts';
import { jsonResponse, requireSecret } from '../_shared/http.ts';
import { restClient } from '../_shared/db.ts';
import { embedTexts, toVectorLiteral } from '../_shared/embeddings.ts';
import { type KbRow, planIngest } from '../_shared/kb-plan.ts';

const MAX_MARKDOWN = 400_000;

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const denied = await requireSecret(
    request,
    'x-support-secret',
    requireEnv('SUPPORT_INGEST_SECRET'),
  );
  if (denied) return denied;

  let body: { source?: unknown; markdown?: unknown; dryRun?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'INVALID_JSON' }, 400);
  }

  const source = typeof body.source === 'string' ? body.source.trim() : '';
  const markdown = typeof body.markdown === 'string' ? body.markdown : '';
  const dryRun = body.dryRun === true;

  if (!source || source.length > 200) return jsonResponse({ error: 'INVALID_SOURCE' }, 400);
  if (!markdown.trim()) return jsonResponse({ error: 'EMPTY_MARKDOWN' }, 400);
  if (markdown.length > MAX_MARKDOWN) return jsonResponse({ error: 'MARKDOWN_TOO_LARGE' }, 413);

  try {
    const rest = restClient();
    const filter = `source=eq.${encodeURIComponent(source)}`;
    const existing = await rest.select<KbRow>(
      'support_kb_chunks',
      `select=id,content_hash&${filter}`,
    );

    const plan = await planIngest(markdown, existing);

    const summary = {
      source,
      existing: existing.length,
      chunks: plan.chunks.length,
      embedded: plan.toEmbed.length,
      unchanged: plan.chunks.length - plan.toEmbed.length,
      stale: plan.staleHashes.length,
      collapsed: plan.collapsed,
      sections: plan.chunks.map((chunk) => ({
        section: chunk.section,
        words: chunk.words,
        hash: chunk.contentHash.slice(0, 12),
        isNew: plan.toEmbed.some((candidate) => candidate.contentHash === chunk.contentHash),
      })),
    };

    if (dryRun) return jsonResponse({ dryRun: true, ...summary });

    // ★★ لا مقطع ⇒ لا حذف: ملفٌّ وصل مبتورًا (أو قُطع نقله) يجعل
    //    الخطّة «احذف الكلّ». نرفض بدل أن نُفرّغ المعرفة.
    if (!plan.chunks.length) return jsonResponse({ error: 'NO_CHUNKS' }, 422);

    if (plan.toEmbed.length) {
      const vectors = await embedTexts(plan.toEmbed.map((chunk) => chunk.content), 'document');
      await rest.upsert(
        'support_kb_chunks',
        plan.toEmbed.map((chunk, index) => ({
          source,
          section: chunk.section,
          content: chunk.content,
          content_hash: chunk.contentHash,
          embedding: toVectorLiteral(vectors[index]),
          updated_at: new Date().toISOString(),
        })),
        'source,content_hash',
      );
    }

    let deleted = 0;
    if (plan.staleHashes.length) {
      const list = plan.staleHashes.map((hash) => `"${hash}"`).join(',');
      const removed = await rest.remove<{ id: string }>(
        'support_kb_chunks',
        `${filter}&content_hash=in.(${encodeURIComponent(list)})&select=id`,
      );
      deleted = removed.length;
    }

    return jsonResponse({ ...summary, deleted });
  } catch (error) {
    // ★ الرمز يُسجَّل خادميًّا ويُعاد للمستدعي: فهرسةٌ فشلت بلا أثر
    //   لا تُشخَّص (القاعدة ٨ في CLAUDE.md).
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(JSON.stringify({
      event: 'kb_ingest_failed',
      reference,
      message: error instanceof Error ? error.message : String(error),
    }));
    return jsonResponse({ error: 'INGEST_FAILED', reference }, 500);
  }
});
