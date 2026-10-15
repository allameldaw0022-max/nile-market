/**
 * قرار المساعد: هل يردّ؟ أم يُسوّد؟ أم يحوّل إلى إنسان؟
 *
 * ★★★ لماذا ملفٌّ نقيّ وحده: هنا يسكن الخطأ الذي يُكلّف سمعة. سطرٌ
 * واحد مقلوب يجعل المساعد يردّ على تذكرةٍ كان يجب أن تُحوَّل — ولا
 * يرفع خطأً، ولا يظهر في سجلّ. فكل بوّابة دالّةٌ خالصة تُختبر بلا
 * شبكةٍ ولا قاعدة، وكل واحدة لها حارسٌ يسقط عند قلبها.
 *
 * ★★ والترتيب مقصود: التحويل يسبق المسوّدة، والمسوّدة تسبق الإرسال.
 * فأي شكٍّ يدفع القرار إلى الأضعف أثرًا — وهذا هو «الفشل يُغلق لا
 * يفتح» (قاعدة ٧) مطبَّقًا على قرارٍ لا على خطأ.
 */

export type TicketFacts = {
  id: string;
  ticketNumber: string;
  /** merchant | customer | partner */
  requesterKind: string;
  status: string;
  subject: string;
  category: string;
  priority: string;
};

/** requester | staff | system */
export type TicketMessage = { authorKind: string; body: string; createdAt: string };

export type KbHit = { section: string; content: string; similarity: number };

export type Gate =
  | { kind: 'skip'; reason: string }
  | { kind: 'escalate'; reason: string }
  | { kind: 'proceed'; question: string };

/**
 * بوّابات ما قبل النموذج — لا تُنادى شبكةٌ قبل أن تمرّ كلّها.
 *
 * ★★★ «تخطّي» ليست «تحويل»: التخطّي يعني **لا عمل لنا هنا** (أجاب
 * بشريّ، أو آخر كلمةٍ لنا) فلا يُزعج أحدًا. والتحويل يعني **هذه
 * تحتاج إنسانًا** فيُنبَّه صاحب المنصّة. وخلطهما يُغرق صاحب المنصّة
 * بتنبيهاتٍ لا عمل فيها حتى يتوقّف عن قراءتها — وتلك أخطر من صمت.
 */
export function gateTicket(ticket: TicketFacts, messages: TicketMessage[]): Gate {
  if (ticket.status === 'closed' || ticket.status === 'resolved') {
    return { kind: 'skip', reason: `التذكرة ${ticket.status}` };
  }
  // ★★★ التجّار وحدهم (قرار صاحب المنصّة): قاعدة المعرفة مكتوبة للتاجر
  //   — تتكلّم عن لوحة التحكّم والباقات والمخزون. وردُّها على زبونٍ
  //   يسأل عن طلبه جوابٌ عن منصّةٍ لا يملكها، وعلى شريكٍ كذلك.
  if (ticket.requesterKind !== 'merchant') {
    return { kind: 'escalate', reason: `صاحب التذكرة ${ticket.requesterKind} لا تاجر` };
  }
  // ★★ العاجل إلى إنسان دائمًا: من اختار «عاجل» ينتظر إنسانًا، وردٌّ
  //    آليٌّ صحيحٌ على تذكرة عاجلة يبدو تهرّبًا.
  if (ticket.priority === 'urgent') {
    return { kind: 'escalate', reason: 'أولوية عاجلة' };
  }
  if (!messages.length) {
    return { kind: 'skip', reason: 'لا رسائل في التذكرة' };
  }
  // ★★★ المساعد **مجيبٌ أوّل** لا مشاركٌ في محادثة: إن أجاب بشريٌّ
  //    مرّةً فالتذكرة له، ودخولُنا بعده يناقضه أو يكرّره أمام التاجر.
  if (messages.some((message) => message.authorKind === 'staff')) {
    return { kind: 'skip', reason: 'أجاب فريق الدعم قبلنا' };
  }
  const last = messages[messages.length - 1];
  if (last.authorKind !== 'requester') {
    return { kind: 'skip', reason: `آخر رسالة من ${last.authorKind}` };
  }
  const question = `${ticket.subject}\n\n${last.body}`.trim();
  if (question.length < 5) {
    return { kind: 'escalate', reason: 'نصّ التذكرة أقصر من أن يُفهم' };
  }
  return { kind: 'proceed', question };
}

/**
 * بوّابة السياق: أقربُ مقطعٍ دون العتبة ⇒ لا مرجع، فلا ردّ.
 *
 * ★★ والعتبة مقيسة (0.65): أسئلةٌ لا علاقة لها بالمنصّة سقفها 0.6324،
 * وأقلّ مقطعٍ صحيح 0.6796. وهي كاشفةُ «لا شيء ذا صلة» لا حاكمةُ صحّة —
 * فالهامش 0.047 أضيق من أن يُبنى عليه حكمٌ بالصواب. ولذلك تمرّ
 * **كل** المقاطع الفائقة للعتبة إلى النموذج ليحكم بنفسه.
 */
export function gateContext(
  hits: KbHit[],
  minSimilarity: number,
): { kind: 'escalate'; reason: string } | { kind: 'proceed'; hits: KbHit[] } {
  const relevant = hits.filter((hit) => hit.similarity >= minSimilarity);
  if (!relevant.length) {
    const best = hits.length ? Math.max(...hits.map((hit) => hit.similarity)) : 0;
    return {
      kind: 'escalate',
      reason: `لا مقطع فوق العتبة (${minSimilarity}) — أقربها ${best.toFixed(4)}`,
    };
  }
  return { kind: 'proceed', hits: relevant };
}

export type AgentMode = 'draft' | 'auto';

export type Decision = { action: 'reply' | 'draft' | 'escalate'; reason: string };

/** أقصى طول ردٍّ يُرسل بلا مراجعة — أطول منه مؤشّر إطناب أو انحراف. */
export const MAX_AUTO_REPLY_CHARS = 1600;

/** أقصر ردٍّ ذي معنى. */
export const MIN_REPLY_CHARS = 20;

export function decideAction(
  answer: { answer: string; confidence: number; needsHuman: boolean; reason: string },
  options: { mode: AgentMode; minConfidence: number },
): Decision {
  // ★ طلب النموذج للإنسان يسبق كل شيء: هو وحده رأى نصّ التاجر كاملًا.
  if (answer.needsHuman) {
    return { action: 'escalate', reason: answer.reason || 'النموذج طلب إنسانًا' };
  }
  if (answer.answer.length < MIN_REPLY_CHARS) {
    return { action: 'escalate', reason: `ردّ أقصر من ${MIN_REPLY_CHARS} حرفًا` };
  }
  // ★★★ وضع المسوّدة هو الافتراضي، وليس تدرّجًا نحو `auto`: صاحب
  //    المنصّة يقرأ ويرسل. والانتقال إلى `auto` قرارٌ يُتخذ بعد أن
  //    تُقرأ عشرات المسوّدات، لا في أوّل يوم.
  if (options.mode !== 'auto') {
    return { action: 'draft', reason: 'وضع المسوّدة' };
  }
  if (!(answer.confidence >= options.minConfidence)) {
    return {
      action: 'draft',
      reason: `ثقة ${answer.confidence} دون العتبة ${options.minConfidence}`,
    };
  }
  if (answer.answer.length > MAX_AUTO_REPLY_CHARS) {
    return { action: 'draft', reason: `ردّ أطول من ${MAX_AUTO_REPLY_CHARS} حرفًا` };
  }
  return { action: 'reply', reason: `ثقة ${answer.confidence}` };
}

/**
 * ذيلُ الإفصاح — يُلحق بالردّ الآليّ وحده.
 *
 * ★★★ لماذا الإفصاح واجب: الرسالة تُكتب `author_kind = 'staff'` فيراها
 * التاجر «فريق الدعم» تمامًا كالردّ البشريّ. وفي وضع المسوّدة هذا
 * صحيح: صاحب المنصّة قرأ وأرسل، فالكلام كلامه. أمّا في `auto` فلم
 * يقرأه أحد ⇒ عرضُه كأنّه بشريّ **تضليل**. والسطر يُفصح ويُفيد معًا:
 * يقول للتاجر كيف يصل إلى إنسان.
 */
export const AI_DISCLOSURE =
  '\n\n—\nهذا ردّ آليّ من مساعد الدعم. إن لم يحلّ مشكلتك فاكتب ردًّا على'
  + ' التذكرة، وسيتابعها فريق الدعم.';

export function replyBody(answer: string, mode: AgentMode): string {
  const body = answer.trim();
  return mode === 'auto' ? `${body}${AI_DISCLOSURE}` : body;
}
