/**
 * تقطيع ملفّ المعرفة إلى مقاطع صالحة للفهرسة.
 *
 * ★★ لماذا على العناوين لا على عدد الحروف: مقطعٌ يبدأ في منتصف جملة
 * ويقف في منتصف أخرى يعطي إجابةً مبتورة. والعناوين في ملفّنا مكتوبة
 * ليكون كل قسم مفهومًا بذاته، فالقطع عليها يحفظ المعنى.
 *
 * ★★ وملفّ خالٍ من Deno: يُحمَّل في اختبارات الوحدة بـnode مباشرة.
 *    منطق التقطيع هو الجزء الذي يُخطئ فعلًا — والشبكة لا تُختبر.
 */

export type Chunk = {
  /** عنوان القسم `##` الذي ينتمي إليه المقطع. */
  section: string;
  /** نصّ المقطع، مسبوقًا بعنوان قسمه ليحمل سياقه. */
  content: string;
  words: number;
};

export type ChunkOptions = {
  /** أدنى عدد كلمات يُقبل قبل القطع (ما لم ينتهِ القسم). */
  minWords?: number;
  /** أقصى عدد كلمات للمقطع. */
  maxWords?: number;
  /** كلمات تُكرَّر من ذيل المقطع السابق في رأس التالي. */
  overlapWords?: number;
};

/**
 * ★★★ القيم مُعايَرة على `docs/support-knowledge-base.md` فعلًا، وعلى
 *    **قياس استرجاع حقيقي** لا على التقدير. ثلاث محاولات:
 *
 *    · ٨٠٠ كلمة ⇒ ١٨ مقطعًا: كل قسمٍ متجهٌ واحد، فقسم «أسئلة شائعة»
 *      وحده ٦٩٨ كلمة تضمّ ٣٨ سؤالًا ⇒ متجهٌ لا يدلّ على شيء بعينه.
 *    · ٢٦٠ كلمة بتراكب ٤٠ ⇒ ٢٤ مقطعًا. قِيس على خمس شكاوى تجّار
 *      حقيقية: ثلاث نجحت، وواحدة جزئية، و«الزبون قال حول كيف اتأكد؟»
 *      **فشلت**: المقطع الذي يحمل جوابها لم يظهر في أقرب خمسة أصلًا.
 *    · ١٣٠ كلمة بلا تراكب ⇒ ٣٥ مقطعًا، وسيطها ١٠٨، وأصغرها ٣٤.
 *
 * ★★ ولماذا سقط التراكب: هو يفيد نصًّا متّصلًا يُقطع في منتصفه. وملفّنا
 *    عناوينُ مستقلّة، فذيلُ المقطع السابق يأتي من **موضوعٍ آخر** ⇒
 *    ضجيجٌ في المتجه لا سياق. (المقطع الذي يحمل «زبون يقول إنه حوّل»
 *    كان مسبوقًا بأربعين كلمة عن أيقونة المتجر.)
 *
 * ★ والحدّ الأدنى ليس زينة: بـ`minWords` صغير يُقطع المقطع عند سطر
 *   عنوانٍ وحده فيولد مقطعٌ من خمس كلمات — ضجيجٌ محضٌ في الفهرس.
 *   (جُرِّب: ١/١١٠ أنتج مقطع «### الباقات» بلا جدوله.)
 */
const DEFAULTS = { minWords: 40, maxWords: 130, overlapWords: 0 };

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

const tailWords = (text: string, n: number) =>
  text.split(/\s+/).filter(Boolean).slice(-n).join(' ');

/** يفصل النصّ عند عناوين المستوى المطلوب، ويُبقي العنوان مع جسمه. */
function splitOnHeading(markdown: string, level: 2 | 3): string[] {
  const marker = '#'.repeat(level);
  const lines = markdown.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith(`${marker} `)) {
      if (current.length) blocks.push(current.join('\n').trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join('\n').trim());
  return blocks.filter(Boolean);
}

/** يقسم كتلةً أطول من الحدّ على الفقرات — آخر ملاذ. */
function splitLongBlock(block: string, maxWords: number): string[] {
  const paragraphs = block.split(/\n{2,}/).filter((p) => p.trim());
  const out: string[] = [];
  let buffer: string[] = [];
  let words = 0;

  for (const paragraph of paragraphs) {
    const n = countWords(paragraph);
    if (words + n > maxWords && buffer.length) {
      out.push(buffer.join('\n\n'));
      buffer = [];
      words = 0;
    }
    buffer.push(paragraph);
    words += n;
  }
  if (buffer.length) out.push(buffer.join('\n\n'));
  return out;
}

export function chunkMarkdown(markdown: string, options: ChunkOptions = {}): Chunk[] {
  const { minWords, maxWords, overlapWords } = { ...DEFAULTS, ...options };
  const chunks: Chunk[] = [];

  for (const section of splitOnHeading(markdown, 2)) {
    const firstLine = section.split('\n', 1)[0] ?? '';
    // ما قبل أوّل `## ` (العنوان الرئيس والمقدّمة) ليس قسمًا — يُتجاوز.
    if (!firstLine.startsWith('## ')) continue;

    const title = firstLine.replace(/^##\s+/, '').trim();
    const body = section.slice(firstLine.length).trim();
    if (!body) continue;

    // كتل القسم: عناوين `###` إن وُجدت، وإلا الجسم كلّه كتلةً واحدة.
    const blocks = splitOnHeading(body, 3)
      .flatMap((b) => (countWords(b) > maxWords ? splitLongBlock(b, maxWords) : b));

    let buffer: string[] = [];
    let words = 0;
    let previousTail = '';

    const flush = () => {
      if (!buffer.length) return;
      // ★ العنوان في رأس كل مقطع: المتجه يحمل سياق قسمه، فمقطعٌ من
      //   «رسائل الخطأ» لا يختلط بمقطعٍ من «حدود النظام».
      const head = previousTail ? `## ${title}\n\n…${previousTail}\n\n` : `## ${title}\n\n`;
      const content = `${head}${buffer.join('\n\n')}`.trim();
      chunks.push({ section: title, content, words: countWords(content) });
      previousTail = overlapWords > 0 ? tailWords(buffer.join('\n\n'), overlapWords) : '';
      buffer = [];
      words = 0;
    };

    for (const block of blocks) {
      const n = countWords(block);
      // ★ لا يُقطع إلا بعد بلوغ الحدّ الأدنى: قطعٌ عند أوّل تجاوزٍ
      //   يولّد مقاطع قزمة لا تُجيب عن شيء.
      if (words + n > maxWords && words >= minWords) flush();
      buffer.push(block);
      words += n;
      if (words >= maxWords) flush();
    }
    flush();
  }

  return chunks;
}

/**
 * بصمة المقطع.
 *
 * ★ تُحسب على النصّ **بعد توحيد المسافات**: تعديلٌ لا يغيّر إلا
 *   فراغًا لا يستحقّ إعادة حساب متجه بالمال.
 */
export async function contentHash(content: string): Promise<string> {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
