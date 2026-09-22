\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set newUser dddddddd-dddd-dddd-dddd-dddddddddddd
\set ownerA  11111111-1111-1111-1111-111111111111
\set PARTNER 9a000000-0000-0000-0000-00000000000a

\echo '── إنشاء المتجر عبر RPC ──'
begin;
select t.reset();
insert into auth.users (id, email, email_confirmed_at)
values (:'newUser', 'newmerchant@test.local', now());

select t.login(:'newUser');
select create_store('متجر جديد', 'my-new-store', 'ملابس');
select t.reset();

select t.ok((select count(*) = 1 from stores where slug = 'my-new-store'),
            'المتجر أُنشئ');
select t.ok((select status = 'draft' from stores where slug = 'my-new-store'),
            'يبدأ كمسودة لا منشورًا');
select t.ok((select count(*) = 1 from store_members m
             join stores s on s.id = m.store_id
             where s.slug = 'my-new-store' and m.role = 'owner' and m.status = 'active'),
            'صف المالك أُنشئ بدور owner');
select t.ok((select count(*) = 1 from store_settings st
             join stores s on s.id = st.store_id where s.slug = 'my-new-store'),
            'إعدادات المتجر أُنشئت');
select t.ok((select count(*) = 1 from store_payment_settings ps
             join stores s on s.id = ps.store_id where s.slug = 'my-new-store'),
            'إعدادات الدفع أُنشئت (جدول منفصل)');
select t.ok((select count(*) = 1 from subscriptions sub
             join stores s on s.id = sub.store_id
             where s.slug = 'my-new-store' and sub.status = 'active'
               and sub.current_period_end is null),
            '★ الباقة المجانية الدائمة مُنحت تلقائيًا بلا تاريخ انتهاء (D15)');
select t.ok((select count(*) = 1 from store_domains d
             join stores s on s.id = d.store_id
             where s.slug = 'my-new-store' and d.kind = 'subdomain' and d.is_primary),
            '★ النطاق الفرعي المجاني أُنشئ تلقائيًا');
rollback;

\echo '── قيود إنشاء المتجر ──'
begin;
select t.reset();
insert into auth.users (id, email, email_confirmed_at)
values (:'newUser', 'newmerchant@test.local', now());
select t.login(:'newUser');

select t.throws('select create_store(''x'', ''my-store'')',
                'اسم أقل من حرفين مرفوض');
select t.throws('select create_store(''متجر'', ''Bad_Slug!'')',
                'slug غير صالح للرابط مرفوض');
select t.throws('select create_store(''متجر'', ''admin'')',
                '★ slug محجوز للنظام مرفوض');
select t.throws('select create_store(''متجر'', ''store-a'')',
                '★ slug مستخدَم من متجر آخر مرفوض');

select create_store('متجر أول', 'first-store');
select t.throws('select create_store(''متجر ثانٍ'', ''second-store'')',
                'متجر ثانٍ لنفس المالك مرفوض في V1');
rollback;

-- زائر غير مسجّل لا ينشئ متجرًا
begin;
select t.logout();
select t.throws('select create_store(''متجر'', ''anon-store'')',
                'زائر مجهول لا ينشئ متجرًا');
rollback;

\echo '── النشر لا يقبل متجرًا ناقصًا ──'
begin;
select t.reset();
insert into auth.users (id, email, email_confirmed_at)
values (:'newUser', 'newmerchant@test.local', now());
select t.login(:'newUser');
select create_store('متجر للنشر', 'publish-test');

select t.ok((select not ok from publish_store(
               (select id from stores where slug = 'publish-test'))),
            'النشر مرفوض والمتجر ناقص');
-- التحويل البنكي مفعّل افتراضيًا في المخطط ⇒ شرط طريقة الدفع محقَّق،
-- فالناقص أربعة: شعار وواتساب ومنتج ومنطقة توصيل.
select t.ok((select array_length(missing, 1) = 4 from publish_store(
               (select id from stores where slug = 'publish-test'))),
            'وتُعاد قائمة الناقص الأربعة');
select t.ok((select 'رقم واتساب' = any(missing) and 'شعار المتجر' = any(missing)
             from publish_store((select id from stores where slug = 'publish-test'))),
            'والقائمة تسمّي كل بند ناقص بالعربية');
select t.ok((select status = 'draft' from stores where slug = 'publish-test'),
            'والمتجر يبقى مسودة');

-- أكمل الناقص ثم انشر
select t.reset();
update stores set logo_url = 'https://x/logo.webp' where slug = 'publish-test';
select t.login(:'newUser');
update store_settings set whatsapp_number = '0912345678', cod_enabled = true
 where store_id = (select id from stores where slug = 'publish-test');
insert into products (store_id, name, slug, price, status)
values ((select id from stores where slug = 'publish-test'), 'منتج', 'p1', 5000, 'draft');
insert into delivery_zones (store_id, name, fee)
values ((select id from stores where slug = 'publish-test'), 'الخرطوم', 2000);

select t.ok((select ok from publish_store(
               (select id from stores where slug = 'publish-test'))),
            '★ النشر ينجح بعد إكمال كل الناقص');
select t.ok((select status = 'active' and published_at is not null
             from stores where slug = 'publish-test'),
            'والمتجر صار نشطًا');
select t.ok((select status = 'active' from products
             where store_id = (select id from stores where slug = 'publish-test')),
            'وأول منتج نُشر معه ليظهر فورًا');
rollback;

\echo '── حالة المتجر تبقى محمية خارج مسار النشر ──'
begin;
select t.login(:'ownerA');
-- RLS تسمح للمالك بتحديث صف متجره (اسم، وصف…) فيتأثر الصف فعلًا،
-- لكن حارس الأعمدة يُرجع status و suspended_* و owner_id بصمت.
-- التأكيد الصحيح هو الأثر لا عدد الصفوف.
update stores set status = 'suspended', name = 'اسم جديد'
 where id = 'a0000000-0000-0000-0000-00000000000a';
select t.ok((select status = 'active' from stores
             where id = 'a0000000-0000-0000-0000-00000000000a'),
            '★ محاولة التاجر تغيير حالة متجره لا تُغيّر شيئًا');
select t.ok((select name = 'اسم جديد' from stores
             where id = 'a0000000-0000-0000-0000-00000000000a'),
            'لكن الأعمدة المسموحة تُحدَّث فعلًا (الحارس انتقائي لا شامل)');
select t.no_effect('update stores set owner_id = ' || quote_literal(:'newUser')
                   || ' where id = ' || quote_literal('b0000000-0000-0000-0000-00000000000b'),
                   'ولا يلمس متجر غيره');
rollback;

\echo '── D19: الإسناد Last-touch عند إنشاء المتجر ──'
begin;
select t.reset();
insert into auth.users (id, email, email_confirmed_at)
values (:'newUser', 'referred@test.local', now());

-- زيارتان: الأقدم لشريك وهمي والأحدث للشريك الحقيقي
insert into partners (id, name, email, status, referral_code)
values ('9b000000-0000-0000-0000-00000000000b', 'شريك ثانٍ',
        'p2@test.local', 'active', 'P2CODE');
insert into referral_visits (partner_id, visitor_token, created_at)
values ('9b000000-0000-0000-0000-00000000000b', 'visitor-xyz', now() - interval '2 days'),
       (:'PARTNER', 'visitor-xyz', now() - interval '1 hour');

select t.login(:'newUser');
select create_store('متجر محال', 'referred-store', null, 'visitor-xyz');
select t.reset();

select t.ok((select r.partner_id = :'PARTNER' from referrals r
             join stores s on s.id = r.store_id where s.slug = 'referred-store'),
            '★ Last-touch: آخر زيارة هي التي تفوز لا الأولى');
select t.ok((select locked from referrals r
             join stores s on s.id = r.store_id where s.slug = 'referred-store'),
            'والعلاقة مقفلة');
rollback;

\echo '── الإسناد خارج نافذة 30 يومًا لا يُحتسب ──'
begin;
select t.reset();
insert into auth.users (id, email, email_confirmed_at)
values (:'newUser', 'old@test.local', now());
insert into referral_visits (partner_id, visitor_token, created_at)
values (:'PARTNER', 'visitor-old', now() - interval '40 days');
select t.login(:'newUser');
select create_store('متجر قديم', 'old-visit-store', null, 'visitor-old');
select t.reset();
select t.empty('select 1 from referrals r join stores s on s.id = r.store_id
                where s.slug = ''old-visit-store''',
               '★ زيارة أقدم من 30 يومًا لا تُنتج إحالة');
rollback;

\echo '✓ اختبارات إنشاء المتجر والنشر مرّت'
