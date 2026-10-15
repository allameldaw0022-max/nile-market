\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set ownerA 11111111-1111-1111-1111-111111111111
\set adminSup 99999999-9999-9999-9999-999999999999

\echo '── مساعد الدعم: باب الكتابة وحدوده (0071 · 0072 · 0073) ──'

-- ═══════════════════════════════════════════════════════════════════
-- ★★★ العطل الذي يحرسه هذا الملفّ أوّلًا: `new ⟶ waiting_customer`
-- ممنوع في آلة الحالة، و0071 كانت تحاوله فتُلتقط الرفض ⇒ الردّ يصل
-- التاجر والحالة تبقى «جديدة» أبدًا. فطابور الدعم يمتلئ بتذاكر
-- مردودٍ عليها تبدو لم تُقرأ. و0073 تنسخ خريطة `reply_to_ticket`.
-- ═══════════════════════════════════════════════════════════════════

begin;
select t.login(:'ownerA');
select ticket_id as tid from create_support_ticket(
  'منتجي يظهر نفد', 'technical', 'كل منتجاتي تظهر نفد رغم وجود رصيد')
\gset
select t.reset();

set local role service_role;
select status_changed as changed from public.ai_support_reply(:'tid', 'افتح لوحة التحكّم ← المخزون واضبط الكمّية.')
\gset
reset role;

select t.ok(:'changed'::boolean, '★★★ ردّ المساعد على تذكرة جديدة ينقل حالتها فعلًا');
select t.ok((select status = 'in_progress' from support_tickets where id = :'tid'),
            '★★★ وإلى «قيد المعالجة» — نفس خريطة الردّ البشريّ لا عُرف ثانٍ');
select t.ok((select author_kind = 'staff' and author_id is null
             from support_messages where ticket_id = :'tid'
             order by created_at desc limit 1),
            '★★ والرسالة من «فريق الدعم» بلا كاتبٍ بشريّ');
select t.ok((select first_response_at is not null from support_tickets where id = :'tid'),
            '★ ويُسجَّل زمن أوّل ردّ — عليه يُحسب SLA');
select t.ok((select exists (select 1 from notifications
             where user_id = :'ownerA' and type = 'support.reply')),
            '★★ ويصل التنبيه لصاحب التذكرة');
select t.ok((select exists (select 1 from support_events
             where ticket_id = :'tid' and event = 'ai_replied'
                   and to_value = 'in_progress')),
            '★★ والحدث يسجّل الحالة التي صارت إليها فعلًا لا التي نرجوها');
rollback;

-- ═══════════════════════════════════════════════════════════════════
-- التذكرة التي بدأت «قيد المعالجة» تصير «في انتظار العميل»
-- ═══════════════════════════════════════════════════════════════════

begin;
select t.login(:'ownerA');
select ticket_id as tid2 from create_support_ticket(
  'سؤال عن الباقات', 'subscription', 'ما الفرق بين الأساسية والاحترافية؟')
\gset
select t.login(:'adminSup');
update support_tickets set status = 'in_progress' where id = :'tid2';
select t.reset();

set local role service_role;
select status_changed as changed2 from public.ai_support_reply(:'tid2', 'الفرق في عدد المنتجات وحدود المتجر.')
\gset
reset role;

select t.ok(:'changed2'::boolean, 'ومن «قيد المعالجة» ينقلها كذلك');
select t.ok((select status = 'waiting_customer' from support_tickets where id = :'tid2'),
            '★★ إلى «في انتظار العميل» — فالطابور يقول الحقيقة');
rollback;

-- ═══════════════════════════════════════════════════════════════════
-- ما لا يحتاج نقلًا لا يُنقل — ولا يُعلَن نقله
-- ═══════════════════════════════════════════════════════════════════

begin;
select t.login(:'ownerA');
select ticket_id as tid3 from create_support_ticket(
  'تذكرة في الانتظار', 'other', 'نصّ المشكلة هنا بالتفصيل')
\gset
select t.login(:'adminSup');
update support_tickets set status = 'in_progress'      where id = :'tid3';
update support_tickets set status = 'waiting_customer' where id = :'tid3';
select t.reset();

set local role service_role;
select status_changed as changed3 from public.ai_support_reply(:'tid3', 'نعم، الخطوات كما شرحنا.')
\gset
reset role;

-- ★★★ `waiting_customer ⟶ waiting_customer` انتقالٌ **غير مشروع** في
--   آلة الحالة، فمحاولته تُسقط الكتلة. والشرط `is distinct from`
--   يمنع المحاولة أصلًا — وبلا الشرط يُعلَن فشلٌ لا حاجة له.
select t.ok(not :'changed3'::boolean,
            '★★★ ولا يُعلَن نقلٌ لم يحدث: الحالة هي نفسها أصلًا');
select t.ok((select status = 'waiting_customer' from support_tickets where id = :'tid3'),
            'والحالة باقية كما هي');
select t.ok((select count(*) = 1 from support_events
             where ticket_id = :'tid3' and event = 'ai_replied'),
            'وحدثٌ واحد لا حدثان');
rollback;

-- ═══════════════════════════════════════════════════════════════════
-- التذكرة المغلقة تُرفض — لا تُفتح من مسار المساعد
-- ═══════════════════════════════════════════════════════════════════

begin;
select t.login(:'ownerA');
select ticket_id as tid4 from create_support_ticket(
  'تذكرة ستُغلق', 'other', 'نصّ المشكلة هنا بالتفصيل')
\gset
select t.login(:'adminSup');
update support_tickets set status = 'closed' where id = :'tid4';
select t.reset();

set local role service_role;
select t.throws('select public.ai_support_reply(' || quote_literal(:'tid4') || ', ''ردّ'')',
                '★★ المساعد لا يردّ على تذكرة مغلقة ولا يُعيد فتحها');
select t.throws('select public.ai_support_reply(' || quote_literal(:'tid4') || ', ''   '')',
                '★ ولا يُدرج رسالة فارغة');
select t.throws('select public.ai_support_reply('
                || quote_literal('00000000-0000-0000-0000-000000000000') || ', ''ردّ'')',
                '★ وتذكرةٌ غير موجودة تُرفع لا تُبتلع');
reset role;
rollback;

-- ═══════════════════════════════════════════════════════════════════
-- المنحة هي الجدار: لا anon ولا authenticated يلمس مسار المساعد
-- ═══════════════════════════════════════════════════════════════════

begin;
select t.login(:'ownerA');
select ticket_id as tid5 from create_support_ticket(
  'تذكرة للحدود', 'other', 'نصّ المشكلة هنا بالتفصيل')
\gset

-- ★★★ لو بقيت المنحة لـ`authenticated` لصار أي تاجر قادرًا على كتابة
--   رسالة باسم «فريق الدعم» في تذكرته — فيُلبّس على نفسه، أو على
--   موظّفٍ يقرأ المحادثة لاحقًا.
select t.throws('select public.ai_support_reply(' || quote_literal(:'tid5') || ', ''ردّ منتحَل'')',
                '★★★ التاجر لا ينادي باب كتابة المساعد');
select t.throws('select public.match_support_kb(null)',
                '★★ ولا يبحث في قاعدة المعرفة مباشرةً');
select t.empty('select 1 from public.support_kb_chunks',
               '★★ ولا يقرأ مقاطع المعرفة');
select t.empty('select 1 from public.support_ai_logs',
               '★★★ ولا سجلّ قرارات المساعد — فيه مسوّدات لم يُقرّ بها أحد');

select t.logout();
select t.throws('select public.ai_support_reply(' || quote_literal(:'tid5') || ', ''ردّ'')',
                '★★ والزائر كذلك');
select t.empty('select 1 from public.support_kb_chunks', '★ والزائر لا يقرأ المعرفة');
rollback;

-- ═══════════════════════════════════════════════════════════════════
-- بوّابة 0072: العلم لا يُفتح إلا من داخل الدالّة
-- ═══════════════════════════════════════════════════════════════════

begin;
select t.login(:'ownerA');
select ticket_id as tid6 from create_support_ticket(
  'تذكرة البوّابة', 'other', 'نصّ المشكلة هنا بالتفصيل')
\gset

-- ★★ انتقالٌ مشروع في آلة الحالة (new ⟶ in_progress) لكنه ممنوع على
--    التاجر: الحارس يشترط صلاحية موظّف. والعلم لا يُنقذه — ما دام
--    `set_config` غير مكشوفة عبر PostgREST (انظر 0072).
select t.no_effect('update support_tickets set status = ''in_progress'' where id = '
                   || quote_literal(:'tid6'),
                   '★★ التاجر لا ينقل حالة تذكرته إلى «قيد المعالجة»');

-- ★★★ وبعد نداء المساعد: العلم يُطفأ داخل الدالّة، فلا يبقى مفتوحًا
--    لما بعدها في المعاملة نفسها.
select t.reset();
set local role service_role;
select count(*) as replies from public.ai_support_reply(:'tid6', 'ردّ المساعد هنا.')
\gset
reset role;
select t.ok(:'replies'::int = 1, 'الدالّة تعيد صفًّا واحدًا');
select t.login(:'ownerA');
select t.no_effect('update support_tickets set status = ''resolved'' where id = '
                   || quote_literal(:'tid6'),
                   '★★★ والعلم مُطفأ بعد الدالّة — لا يبقى بابًا مفتوحًا في المعاملة');
rollback;

\echo '── تمّ: مساعد الدعم ──'
