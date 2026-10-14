import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * ═══════════════════════════════════════════════════════════════════
 * اسمُ عمودِ الإخراج متغيّرٌ — ومرجعٌ مجرّدٌ به يرفع 42702.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ★★★ العطل الذي يحرسه: `save_product` تُعلن
 * `returns table (product_id uuid, …)`، وأسماء أعمدة الإخراج في
 * PL/pgSQL **متغيّرات**. وكتلة حدّ التنبيه وحدها كانت تكتب:
 *
 *     on conflict (product_id, coalesce(variant_id, '000…'::uuid))
 *
 * فالاسم عمودٌ ومتغيّرٌ معًا ⇒ `42702: column reference "product_id"
 * is ambiguous`، ورمزٌ غير مترجَم ⇒ «حدث خطأ غير متوقع». النتيجة:
 * **لا تاجرٌ في المنصّة كلّها استطاع حفظ منتج بحدّ تنبيه منذ الإطلاق**
 * — وهو ما فتح تذكرة الدعم التي بدأت من «لا أستطيع رفع منتج».
 *
 * ★★ ولمَ لا يكشفه شيء آخر: الكتلة **شرطية** — من يترك الحقل فارغًا
 * لا يمرّ بها. فالدالّة تنجح في كل اختبار وكل استعمالٍ عاديّ، وتفشل
 * عند من ملأ حقلًا واحدًا. والصنف تكرّر ثلاث مرّات في هذا المستودع:
 * 0034 (`validate_coupon`) و0061 (`create_digital_order`) وهذه.
 *
 * ★ والعلاج ليس `#variable_conflict use_column` (0061 رفضها: تُخفي
 * اللبس بدل إظهاره) بل التأهيل بأليَس — أو، حيث لا يقبل النحو تأهيلًا
 * كما في `on conflict`، نقلُ الجملة إلى دالّةٍ لا أسماء إخراج فيها.
 *
 * القراءة من الهجرات: مصدر الحقيقة، وبلا شبكة ولا قاعدة.
 */

const root = new URL('../', import.meta.url);

/** آخر تعريف لكل دالّة — 0034 و0061 أصلحتا ما في 0008 و0059. */
type Fn = { file: string; name: string; outs: string[]; body: string };

const FN_RE =
  /create\s+(?:or\s+replace\s+)?function\s+((?:public|app)\.[a-z_0-9]+)\s*\(([\s\S]*?)\)\s*\n\s*(returns[\s\S]*?)\bas\s+\$\$([\s\S]*?)\$\$\s*;/gi;

function latestDefinitions(): Fn[] {
  const byName = new Map<string, Fn>();
  const files = readdirSync(new URL('supabase/migrations/', root))
    .filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = readFileSync(new URL(`supabase/migrations/${file}`, root), 'utf8');
    for (const m of sql.matchAll(FN_RE)) {
      const [, name, args, ret, body] = m;
      const outs = new Set<string>();
      const table = /returns\s+table\s*\(([\s\S]*?)\)\s*language/i.exec(ret);
      if (table) {
        for (const part of table[1].split(',')) {
          const first = part.trim().split(/\s+/)[0];
          if (first) outs.add(first.toLowerCase());
        }
      }
      // معاملات `out` تصير متغيّرات كذلك
      for (const a of args.split(',')) {
        const t = a.trim().split(/\s+/);
        if (t[0]?.toLowerCase() === 'out' && t[1]) outs.add(t[1].toLowerCase());
      }
      byName.set(name.toLowerCase(), { file, name, outs: [...outs], body });
    }
  }
  return [...byName.values()];
}

const fns = latestDefinitions();

/** مرجعٌ مجرّد: لا نقطة قبله ولا حرف. */
const bare = (word: string) => new RegExp(`(?<![.\\w])${word}(?![\\w])`, 'i');

/** الدوالّ التي تُعلن `use_column` تحلّ اللبس عمدًا — موثَّقٌ في جسمها. */
const guarded = (f: Fn) => /#variable_conflict\s+use_column/i.test(f.body);

const withOuts = fns.filter((f) => f.outs.length > 0 && !guarded(f));

test('الحارس يرى الهجرات فعلًا — وإلا فهو يحرس الفراغ', () => {
  assert.ok(fns.length >= 200, `لم تُقرأ إلا ${fns.length} دالّة — المطابِق انكسر`);
  assert.ok(withOuts.length >= 20,
    `لم تُقرأ إلا ${withOuts.length} دالّة بأعمدة إخراج`);
  const saveProduct = fns.find((f) => f.name.toLowerCase() === 'public.save_product');
  assert.ok(saveProduct, '`save_product` مفقودة — المطابِق لا يرى الدوالّ الكبيرة');
  assert.deepEqual(saveProduct.outs, ['product_id', 'slug'],
    'أعمدة إخراج `save_product` لم تُقرأ — أساس الفحص كلّه');
});

test('★★★ لا اسم عمودِ إخراجٍ مجرّدًا في `on conflict`', () => {
  // ★ `on conflict` **لا تقبل** تأهيلًا: `on conflict (t.col, …)` ترفع
  //   `42601 syntax error` (مُجرَّب). فالعلاج الوحيد نقل الجملة إلى
  //   دالّةٍ لا أسماء إخراج فيها — كـ`app.set_low_stock_threshold`.
  const bad: string[] = [];
  for (const f of withOuts) {
    for (const oc of f.body.matchAll(/on\s+conflict\s*\(([\s\S]*?)\)\s*\n?\s*(?:do|where)\b/gi)) {
      for (const out of f.outs) {
        if (bare(out).test(oc[1]))
          bad.push(`${f.file} · ${f.name} · «${out}» في ${oc[1].replace(/\s+/g, ' ').trim()}`);
      }
    }
  }
  assert.deepEqual(bad, [],
    'مرجعٌ ملتبس في `on conflict`: كل نداء يمرّ به يرفع 42702 فيرى ' +
    'المستخدم «حدث خطأ غير متوقع».\n' + bad.join('\n'));
});

test('★★ ولا في شرطٍ غير مؤهَّل (`where col = …`)', () => {
  // ★ نفس العلّة في موضعٍ آخر — وهي ما أوقف كل طلب رقمي حتى 0061،
  //   وما كان سيوقف كل كود خصم بحدّ استخدام حتى 0034. والعلاج هناك
  //   أليَسٌ للجدول (`cr.coupon_id`) لا تعطيلُ الحارس.
  const bad: string[] = [];
  for (const f of withOuts) {
    const body = f.body.replace(/--[^\n]*/g, '');
    for (const out of f.outs) {
      const re = new RegExp(
        `(?:\\bwhere\\b|\\band\\b|\\bor\\b|\\bon\\b)\\s+(?<![.\\w])${out}(?![\\w])\\s*(?:=|<>|is\\b|in\\b)`,
        'gi',
      );
      for (const m of body.matchAll(re))
        bad.push(`${f.file} · ${f.name} · «${out}» في ${m[0].replace(/\s+/g, ' ')}`);
    }
  }
  assert.deepEqual(bad, [],
    'مرجعٌ ملتبس في شرط: أهّله باسم الجدول أو بأليَس.\n' + bad.join('\n'));
});
