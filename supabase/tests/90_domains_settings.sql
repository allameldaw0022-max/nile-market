\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set csA    66666666-6666-6666-6666-666666666666

\echo '── إضافة دومين مخصص ──'
begin;
select t.login(:'ownerA');
select t.ok((select count(*) = 1 from add_custom_domain(:'A', 'shop.example.sd')),
            'المالك يضيف دومينًا مخصصًا');
select t.ok((select status = 'verification_required' from store_domains
             where hostname = 'shop.example.sd'),
            'يبدأ بحالة «يحتاج تحققًا»');
select t.ok((select length(verification_token) = 32 from store_domains
             where hostname = 'shop.example.sd'),
            'ويحمل توكن تحقق');

select t.throws('select add_custom_domain(' || quote_literal(:'A')
                || ', ''shop.example.sd'')',
                '★ الدومين نفسه لا يُربط مرتين');
select t.throws('select add_custom_domain(' || quote_literal(:'A')
                || ', ''ليس دومينًا'')',
                'صيغة دومين غير صالحة مرفوضة');
rollback;

begin;
select t.login(:'ownerB');
select t.throws('select add_custom_domain(' || quote_literal(:'A')
                || ', ''hijack.example.sd'')',
                '★ مالك ب لا يضيف دومينًا لمتجر أ');
rollback;

begin;
select t.login(:'csA');
select t.throws('select add_custom_domain(' || quote_literal(:'A')
                || ', ''cs.example.sd'')',
                'خدمة العملاء لا تملك domain:manage');
rollback;

\echo '── ★ التحقق من الدومين ليس بيد العميل ──'
begin;
select t.login(:'ownerA');
\o /dev/null
select add_custom_domain(:'A', 'verify.example.sd');
\o
select t.throws('select verify_domain((select id from store_domains '
                || 'where hostname = ''verify.example.sd''), array[''أي شيء''])',
                '★ التاجر لا ينادي verify_domain إطلاقًا (لا منح)');
rollback;

-- التوكن الصحيح يمر، والخاطئ لا — والمنفّذ هو النظام لا العميل
begin;
select t.reset();
insert into store_domains (store_id, hostname, kind, status, verification_token)
values (:'A', 'dns.example.sd', 'custom', 'verification_required', 'TOK123');

select t.ok((select not verified from verify_domain(
               (select id from store_domains where hostname = 'dns.example.sd'),
               array['nile-market-verification=WRONG'])),
            '★ سجل TXT خاطئ لا يُفعّل الدومين');
select t.ok((select status = 'verification_required' from store_domains
             where hostname = 'dns.example.sd'),
            'والحالة تبقى كما هي');
select t.ok((select verified from verify_domain(
               (select id from store_domains where hostname = 'dns.example.sd'),
               array['"nile-market-verification=TOK123"'])),
            'السجل الصحيح (ولو باقتباس) يُفعّل الدومين');
select t.ok((select status = 'active' and verified_at is not null from store_domains
             where hostname = 'dns.example.sd'),
            'والحالة تصبح نشطة بتاريخ تحقق');
rollback;
select t.reset();

\echo '── الدومين الأساسي ──'
begin;
select t.reset();
insert into store_domains (store_id, hostname, kind, status, verification_token)
values (:'A', 'primary.example.sd', 'custom', 'verification_required', 'TOK999');

select t.login(:'ownerA');
select t.throws('select set_primary_domain((select id from store_domains '
                || 'where hostname = ''primary.example.sd''))',
                '★ دومين غير متحقق لا يصلح أساسيًا');
rollback;

begin;
select t.reset();
insert into store_domains (store_id, hostname, kind, status, verified_at)
values (:'A', 'ready.example.sd', 'custom', 'active', now());

select t.login(:'ownerA');
select set_primary_domain((select id from store_domains where hostname = 'ready.example.sd'));
select t.ok((select is_primary from store_domains where hostname = 'ready.example.sd'),
            'الدومين المتحقق يصبح الأساسي');
select t.ok((select count(*) = 1 from store_domains
             where store_id = :'A' and is_primary),
            '★ أساسي واحد لا أكثر');
select t.ok((select redirect_to_primary from store_domains
             where store_id = :'A' and kind = 'subdomain'),
            '★ النطاق الفرعي يحوّل إلى الأساسي (301)');
rollback;

begin;
select t.reset();
insert into store_domains (store_id, hostname, kind, status, verified_at)
values (:'A', 'other.example.sd', 'custom', 'active', now());

-- المعرّف يُقرأ بصلاحية النظام: لو قرأه مالك ب لرشّحته RLS فصار
-- الرفض بسبب «غير موجود» لا بسبب الصلاحية، والمقصود اختبار الصلاحية.
select id as otherid from store_domains where hostname = 'other.example.sd'
\gset

select t.login(:'ownerB');
select t.throws('select set_primary_domain(' || quote_literal(:'otherid') || ')',
                '★ مالك ب لا يغيّر أساسي متجر أ');
select t.throws('select remove_custom_domain(' || quote_literal(:'otherid') || ')',
                '★ مالك ب لا يحذف دومين متجر أ');
rollback;

\echo '── حذف الدومين المخصص ──'
begin;
select t.reset();
-- الفهرس الفريد يسمح بأساسي واحد، فيُفرَّغ القديم قبل إدراج الجديد
update store_domains set is_primary = false
 where store_id = :'A' and kind = 'subdomain';
insert into store_domains (store_id, hostname, kind, status, verified_at, is_primary)
values (:'A', 'gone.example.sd', 'custom', 'active', now(), true);

select t.login(:'ownerA');
select remove_custom_domain((select id from store_domains where hostname = 'gone.example.sd'));
select t.ok((select count(*) = 0 from store_domains where hostname = 'gone.example.sd'),
            'الدومين المخصص يُحذف');
select t.ok((select is_primary from store_domains
             where store_id = :'A' and kind = 'subdomain'),
            '★ النطاق الفرعي يعود أساسيًا فلا يبقى المتجر بلا عنوان');

select t.throws('select remove_custom_domain((select id from store_domains '
                || 'where store_id = ' || quote_literal(:'A') || ' and kind = ''subdomain''))',
                '★ نطاق نايل ماركت الفرعي لا يُحذف');
rollback;
select t.reset();


\echo '── دعوات فريق المتجر ──'
begin;
select t.login(:'ownerA');
select t.ok((select length(token) = 48 from invite_store_member(
               :'A', 'NewStaff@Example.com', 'orders')),
            'المالك يدعو موظفًا ويحصل على توكن مرة واحدة');
select t.ok((select email = 'newstaff@example.com' from store_invitations
             where store_id = :'A'),
            'البريد يُخزَّن بحروف صغيرة');
select t.ok((select token_hash <> 'x' and length(token_hash) = 64
             from store_invitations where store_id = :'A'),
            '★ التوكن يُخزَّن مجزَّأً لا خامًا');

select t.throws('select invite_store_member(' || quote_literal(:'A')
                || ', ''بريد-خاطئ'', ''orders'')',
                'بريد غير صحيح مرفوض');
select t.throws('select invite_store_member(' || quote_literal(:'A')
                || ', ''x@y.com'', ''owner'')',
                '★ لا دعوة بدور المالك');
rollback;

begin;
select t.login(:'ownerB');
select t.throws('select invite_store_member(' || quote_literal(:'A')
                || ', ''x@y.com'', ''orders'')',
                '★ مالك ب لا يدعو إلى متجر أ');
rollback;

-- مدير المتجر يملك members:manage لكن ترقية موظف إلى «مدير» للمالك وحده
begin;
select t.login('33333333-3333-3333-3333-333333333333');
select t.throws('select invite_store_member(' || quote_literal(:'A')
                || ', ''x@y.com'', ''manager'')',
                '★ المدير لا يصنع مديرًا آخر');
select t.ok((select length(token) = 48 from invite_store_member(
               :'A', 'staff2@example.com', 'products')),
            'لكنه يدعو موظفًا عاديًا');
rollback;

\echo '── قبول الدعوة ──'
begin;
select t.login(:'ownerA');
select token as invtok from invite_store_member(:'A', 'joiner@example.com', 'products')
\gset

-- الزبون يقبل الدعوة بحسابه هو، لا بالبريد المكتوب فيها
select t.login('77777777-7777-7777-7777-777777777777');
select t.ok((select role = 'products' from accept_store_invitation(:'invtok')),
            'الدعوة تُقبل وتعيد الدور');
select t.reset();
select t.ok((select status = 'active' and role = 'products' from store_members
             where store_id = :'A' and profile_id = '77777777-7777-7777-7777-777777777777'),
            'وتُنشأ العضوية نشطة');
select t.ok((select accepted_at is not null from store_invitations
             where email = 'joiner@example.com'),
            'والدعوة تُوسم مقبولة');

select t.login('77777777-7777-7777-7777-777777777777');
select t.throws('select accept_store_invitation(' || quote_literal(:'invtok') || ')',
                '★ الدعوة لا تُقبل مرتين');
select t.throws('select accept_store_invitation(''توكن-مخترَع'')',
                '★ توكن مخترَع مرفوض');
rollback;

-- دعوة منتهية لا تُقبل
begin;
select t.login(:'ownerA');
select token as exptok from invite_store_member(:'A', 'late@example.com', 'orders')
\gset
select t.reset();
update store_invitations set expires_at = now() - interval '1 day'
 where email = 'late@example.com';
select t.login('77777777-7777-7777-7777-777777777777');
select t.throws('select accept_store_invitation(' || quote_literal(:'exptok') || ')',
                '★ دعوة منتهية مرفوضة');
rollback;

\echo '── إدارة الأعضاء ──'
begin;
select t.reset();
select id as mid from store_members
 where store_id = :'A' and profile_id = '44444444-4444-4444-4444-444444444444'
\gset

select t.login(:'ownerA');
select set_store_member_role(:'mid', 'products');
select t.ok((select role = 'products' from store_members where id = :'mid'),
            'المالك يغيّر دور موظف');
select t.throws('select set_store_member_role(' || quote_literal(:'mid') || ', ''owner'')',
                '★ دور المالك لا يُمنح من هنا');

select remove_store_member(:'mid');
select t.ok((select deleted_at is not null from store_members where id = :'mid'),
            'الإزالة ناعمة فيبقى أثر ما نفّذه');
rollback;

begin;
select t.reset();
select id as ownmid from store_members
 where store_id = :'A' and role = 'owner'
\gset
select t.login(:'ownerA');
select t.throws('select remove_store_member(' || quote_literal(:'ownmid') || ')',
                '★ مالك المتجر لا يُزال');
rollback;

begin;
select t.reset();
select id as selfmid from store_members
 where store_id = :'A' and profile_id = '33333333-3333-3333-3333-333333333333'
\gset
select t.login('33333333-3333-3333-3333-333333333333');
select t.throws('select remove_store_member(' || quote_literal(:'selfmid') || ')',
                '★ لا يزيل العضو عضويته هو');
select t.throws('select set_store_member_role(' || quote_literal(:'selfmid') || ', ''manager'')',
                '★ ولا يرفع دور نفسه');
rollback;
select t.reset();

\echo '✓ اختبارات الدومين وفريق المتجر مرّت'
