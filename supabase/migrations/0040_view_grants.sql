-- =====================================================================
-- 0040 العروض: منح القراءة وحدها (إضافية)
--
-- ★ الثغرة الكامنة: العروض الثلاثة في `public` — `store_team`
-- و`ledger_balances` و`partner_balances` — تحمل منحًا كاملة
-- (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER)
-- لدوري `anon` و`authenticated`. وهي منح لم يُقصد أيٌّ منها: العروض
-- أسطح قراءة.
--
-- لماذا لم تنفجر بعد: العروض الثلاثة غير قابلة للتحديث تلقائيًا
-- (ضمّ في store_team و partner_balances، وتجميع في ledger_balances)،
-- فيردّ Postgres اليوم «cannot insert into view». المنح إذن غير نافذ
-- **بالصدفة المعماريّة لا بالتصميم**: أوّل `instead of` trigger
-- يُضاف لاحقًا لأي منها يجعل الكتابة نافذة فورًا — وعلى
-- `partner_balances` تعني كتابة مستحقّات شريك، وعلى `ledger_balances`
-- كتابة رصيد في دفتر الأستاذ.
--
-- مصدرها `alter default privileges` على السكيما: كل علاقة جديدة في
-- `public` ترث المنح الكاملة، والجداول تُنقذها RLS — أما العروض فلا
-- RLS لها، فلا يبقى بينها وبين الكتابة إلا قابلية التحديث.
--
-- الإصلاح: سحب كل شيء ثم منح SELECT وحده. لا سلوك قائم يتغيّر: كل
-- استعمالات العروض في التطبيق قراءة.
--
-- ملاحظة على `store_team`: يبقى SECURITY DEFINER عن قصد. هو ما يتيح
-- لمالك المتجر قراءة أسماء زملائه دون توسيع سياسات `profiles` (التي
-- تكشف الصف لصاحبه وحده). العزل مفروض داخل شرط العرض نفسه، وهو
-- مُثبَت بالتنفيذ في supabase/tests/105_view_isolation.sql. تحذير
-- المستشار `security_definer_view` مُبقًى عن معرفة، موثَّقًا في
-- docs/FINAL-AUDIT-REPORT.md.
-- =====================================================================

revoke all on public.store_team       from anon, authenticated;
revoke all on public.ledger_balances  from anon, authenticated;
revoke all on public.partner_balances from anon, authenticated;

-- `store_team` يُقرأ من لوحة التاجر فقط؛ الزائر المجهول لا شأن له به.
grant select on public.store_team to authenticated;

-- العرضان الماليّان security_invoker: سياسات القارئ هي الحاجز، والمنح
-- لا يفتح شيئًا بذاته. يبقى anon بلا منح لأنه بلا سياسة أصلًا.
grant select on public.ledger_balances  to authenticated;
grant select on public.partner_balances to authenticated;
