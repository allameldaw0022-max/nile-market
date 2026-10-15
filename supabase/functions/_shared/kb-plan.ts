/**
 * خطّة الفهرسة: ما يُحسب متجهه، وما يُترك، وما يُحذف.
 *
 * ★★★ لماذا خطّةٌ منفصلة ونقيّة: هنا يقع الخطأ المكلف. حسابُ متجهٍ
 * لمقطعٍ لم يتغيّر مالٌ يُدفع بلا سبب (القاعدة ٧: UPSERT بالبصمة)،
 * وحذفٌ قبل إدراجٍ ناجح يُفرّغ قاعدة المعرفة فيصير المساعد أبكم.
 * فالمنطق مكتوبٌ بلا شبكةٍ ولا بيئة، ويُختبر في
 * `tests/ai-support-kb.test.ts` بلا مفتاحٍ ولا قاعدة.
 *
 * ★★ وتكرار البصمة داخل الدفعة يجب أن يُطوى **قبل** الإرسال: إدراجٌ
 * فيه صفّان بالبصمة ذاتها يُسقطه Postgres بـ21000 («on conflict لا
 * تُصيب صفًّا مرّتين») — وهو خطأٌ لا علاقة لنصّه بالسبب.
 */

import { type Chunk, type ChunkOptions, chunkMarkdown, contentHash } from './chunk.ts';

export type KbRow = { id: string; content_hash: string };

export type PlannedChunk = Chunk & { contentHash: string };

export type IngestPlan = {
  /** المقاطع الفريدة بالبصمة، بترتيب ورودها في الملفّ. */
  chunks: PlannedChunk[];
  /** ما يحتاج متجهًا جديدًا — مقاطع ليست في القاعدة. */
  toEmbed: PlannedChunk[];
  /** بصمات موجودة في القاعدة ولم تَعُد في الملفّ ⇒ تُحذف بعد الإدراج. */
  staleHashes: string[];
  /** مقاطع طُويت لتكرار بصمتها داخل الملفّ نفسه. */
  collapsed: number;
};

export async function planIngest(
  markdown: string,
  existing: KbRow[],
  options: ChunkOptions = {},
): Promise<IngestPlan> {
  const existingHashes = new Set(existing.map((row) => row.content_hash));
  const seen = new Set<string>();
  const chunks: PlannedChunk[] = [];
  let collapsed = 0;

  for (const chunk of chunkMarkdown(markdown, options)) {
    const hash = await contentHash(chunk.content);
    if (seen.has(hash)) {
      collapsed += 1;
      continue;
    }
    seen.add(hash);
    chunks.push({ ...chunk, contentHash: hash });
  }

  return {
    chunks,
    toEmbed: chunks.filter((chunk) => !existingHashes.has(chunk.contentHash)),
    staleHashes: [...existingHashes].filter((hash) => !seen.has(hash)),
    collapsed,
  };
}
