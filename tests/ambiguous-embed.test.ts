import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');

/**
 * ═══════════════════════════════════════════════════════════════════
 * تضمينٌ ملتبس = استعلامٌ يُردّ قبل القاعدة.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ★★★ العطل: `subscriptions` لها مفتاحان نحو `plans` (`plan_id`
 * و`previous_plan_id`). فـ`.select('…, plans(name)')` لا يعرف
 * PostgREST أيّهما يقصد، فيردّ **300 Multiple Choices** — قبل أن يلمس
 * الطلبُ القاعدة، فلا أثر له في سجلّ Postgres إطلاقًا.
 *
 * ★★ وأثره كان صامتًا وفادحًا: `const { data: sub }` تبتلع الخطأ،
 * فتعود `null`، فـ`subStatus = sub?.status ?? 'expired'` ⇒ **كل تاجر
 * في المنصّة** يرى في أعلى لوحته «الشراء من متجرك متوقّف حاليًا»
 * وزرّ «تجديد الاشتراك» — وهو مشترك ودافع. مُثبَت على الإنتاج:
 * ثلاثة ردود 300 في سجلّ البوّابة، وحسابٌ تجريبيّ باشتراك **نشط**
 * تظهر لوحته «منتهٍ».
 *
 * الأزواج الملتبسة تُستخرج من الهجرات لا تُكتب يدويًّا: كل مفتاحٍ
 * جديد نحو جدولٍ مرتبط أصلًا يدخل الحارس من تلقائه.
 */

const migrations = readdirSync(new URL('supabase/migrations/', root))
  .filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

/** (جدول ⟶ جدول مرجوع) ⟶ عدد المفاتيح بينهما. */
function ambiguousPairs(): Map<string, Set<string>> {
  const pairs = new Map<string, Map<string, number>>();
  const bump = (from: string, to: string) => {
    const m = pairs.get(from) ?? new Map<string, number>();
    m.set(to, (m.get(to) ?? 0) + 1);
    pairs.set(from, m);
  };

  // أعمدة داخل `create table public.X ( … references public.Y … )`
  for (const m of migrations.matchAll(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\);/gi,
  )) {
    const from = m[1].toLowerCase();
    for (const r of m[2].matchAll(/references\s+public\.(\w+)\s*\(/gi)) {
      bump(from, r[1].toLowerCase());
    }
  }
  // ومفاتيح تُضاف لاحقًا
  for (const m of migrations.matchAll(
    /alter\s+table\s+(?:only\s+)?public\.(\w+)[\s\S]{0,400}?references\s+public\.(\w+)\s*\(/gi,
  )) {
    bump(m[1].toLowerCase(), m[2].toLowerCase());
  }

  const out = new Map<string, Set<string>>();
  for (const [from, tos] of pairs) {
    const many = new Set([...tos].filter(([, n]) => n > 1).map(([to]) => to));
    if (many.size) out.set(from, many);
  }
  return out;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(new URL(dir, root), { withFileTypes: true })) {
    const path = `${dir}${e.name}`;
    if (e.isDirectory()) sourceFiles(`${path}/`, out);
    else if (/\.tsx?$/.test(e.name) && !/database\.ts$/.test(e.name)) out.push(path);
  }
  return out;
}

const AMBIGUOUS = ambiguousPairs();

test('الحارس استخرج الأزواج الملتبسة فعلًا', () => {
  assert.ok(AMBIGUOUS.get('subscriptions')?.has('plans'),
    'لم يُستخرج الزوج المعروف subscriptions⟶plans — المحلّل انكسر لا الشيفرة');
});

test('★★★ لا تضمين ملتبس بلا تحديد المفتاح', () => {
  const offenders: string[] = [];
  for (const file of sourceFiles('src/')) {
    const src = read(file);
    // `.from('T')` ثم `.select('…')` في نفس السلسلة
    for (const q of src.matchAll(/\.from\(\s*'(\w+)'\s*\)[\s\S]{0,200}?\.select\(\s*([\s\S]{0,400}?)\)/g)) {
      const from = q[1].toLowerCase();
      const risky = AMBIGUOUS.get(from);
      if (!risky) continue;
      for (const to of risky) {
        // تضمين `to(` بلا `to!hint(`
        const bare = new RegExp(`(^|[^!\\w])${to}\\s*\\(`, 'i');
        const hinted = new RegExp(`${to}\\s*!\\s*\\w+\\s*\\(`, 'i');
        if (bare.test(q[2]) && !hinted.test(q[2])) {
          offenders.push(`${file}: from('${from}') يضمّن '${to}(' بلا تحديد المفتاح`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [],
    'PostgREST يردّ 300 على تضمينٍ بين جدولين بينهما أكثر من مفتاح — '
    + 'قبل القاعدة، فلا أثر في سجلّها. استعمل `جدول!اسم_العمود(…)`.\n'
    + offenders.join('\n'));
});
