\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA  11111111-1111-1111-1111-111111111111
\set ownerB  22222222-2222-2222-2222-222222222222
\set custA   77777777-7777-7777-7777-777777777777
\set adminOwner 88888888-8888-8888-8888-888888888888
\set adminSup   99999999-9999-9999-9999-999999999999

\echo '── الرقم يصل من بيانات التسجيل ──'
begin;
select t.reset();
insert into auth.users (id, email, raw_user_meta_data)
values ('e1000000-0000-0000-0000-0000000000e1', 'newsignup@test.local',
        jsonb_build_object('full_name', 'مسجِّل جديد', 'phone', '249912345678'));
select t.ok((select phone = '249912345678' and full_name = 'مسجِّل جديد'
             from profiles where id = 'e1000000-0000-0000-0000-0000000000e1'),
            '★★ التسجيل يكتب الاسم والهاتف في الملف الشخصي');
rollback;

begin;
select t.reset();
insert into auth.users (id, email, raw_user_meta_data)
values ('e2000000-0000-0000-0000-0000000000e2', 'nophone@test.local',
        jsonb_build_object('full_name', 'بلا رقم'));
select t.ok((select phone is null from profiles
             where id = 'e2000000-0000-0000-0000-0000000000e2'),
            '★ ومن سجّل بلا رقم (Google مثلًا) يبقى بلا رقم — لا رقم يُخترع');
rollback;

begin;
select t.reset();
insert into auth.users (id, email, raw_user_meta_data)
values ('e3000000-0000-0000-0000-0000000000e3', 'blank@test.local',
        jsonb_build_object('full_name', 'فراغ', 'phone', '   '));
select t.ok((select phone is null from profiles
             where id = 'e3000000-0000-0000-0000-0000000000e3'),
            '★ والفراغ لا يُخزَّن رقمًا');
rollback;

\echo '── أفضل رقم متاح: الملف ثم المتجر ثم طلب سابق ──'
begin;
select t.reset();
update profiles set phone = '249911111111' where id = :'ownerA';
update store_settings set whatsapp_number = '249922222222' where store_id = :'A';
select t.ok((select phone = '249911111111' and source = 'profile'
             from app.best_contact_phone(:'ownerA')),
            '★★ رقم صاحب الحساب أولى من رقم متجره');
rollback;

begin;
select t.reset();
update profiles set phone = null where id = :'ownerA';
update store_settings set whatsapp_number = '249922222222', contact_phone = '249933333333'
 where store_id = :'A';
select t.ok((select phone = '249922222222' and source = 'store'
             from app.best_contact_phone(:'ownerA')),
            '★ وبلا رقم في الملف: واتساب متجره');
rollback;

begin;
select t.reset();
update profiles set phone = null where id = :'ownerA';
update store_settings set whatsapp_number = null, contact_phone = '249933333333'
 where store_id = :'A';
select t.ok((select phone = '249933333333' and source = 'store'
             from app.best_contact_phone(:'ownerA')),
            'ثم رقم تواصل متجره');
rollback;

begin;
select t.reset();
update profiles set phone = null where id = :'custA';
insert into customers (store_id, profile_id, name, phone)
values (:'A', :'custA', 'زبون', '249944444444');
select t.ok((select phone = '249944444444' and source = 'customer'
             from app.best_contact_phone(:'custA')),
            '★ ومن ترك رقمه في طلب سابق: يظهر رقمه ومصدره');
rollback;

begin;
select t.reset();
update profiles set phone = null where id = :'custA';
select t.empty('select 1 from app.best_contact_phone(' || quote_literal(:'custA') || ')',
               '★★ ومن لا رقم له في أي مصدر: لا صفّ — لا رقم يُخترع');
rollback;

\echo '── قائمة المستخدمين: الرقم ومصدره وحالة الإكمال ──'
begin;
select t.reset();
update profiles set phone = '249911111111' where id = :'ownerA';
select t.login(:'adminOwner');
select t.ok((select phone = '249911111111' and phone_source = 'profile'
             from platform_users() where profile_id = :'ownerA'),
            '★★ الرقم ومصدره يظهران لموظف users:view');
select t.ok((select email_verified_at is not null
             from platform_users() where profile_id = :'ownerA'),
            'وحالة تأكيد البريد معها');

select t.login(:'adminSup');
select t.throws('select 1 from platform_users()',
                '★★★ ولا يراها موظف بلا users:view');
select t.login(:'ownerB');
select t.throws('select 1 from platform_users()',
                '★★★ ولا تاجر');
rollback;

\echo '── ترشيح «لم يُكمل التسجيل» ──'
begin;
select t.reset();
-- ★ الأعمدة الحسّاسة يحرسها 0002/0035: تُكتب بصلاحية users:manage
select t.login(:'adminOwner');
-- حساب مؤكَّد البريد وله متجر ⇒ مكتمل
update profiles set email_verified_at = now() where id = :'ownerA';
-- حساب بلا متجر ⇒ غير مكتمل
update profiles set email_verified_at = now() where id = :'custA';
-- حساب لم يؤكّد بريده ⇒ غير مكتمل ولو ملك متجرًا
update profiles set email_verified_at = null where id = :'ownerB';
select t.empty('select 1 from platform_users(null, null, 100, 0, true)
                 where profile_id = ' || quote_literal(:'ownerA'),
               '★★ صاحب متجر مؤكَّد البريد ليس ضمن «لم يُكمل»');
select t.ok((select count(*) = 1 from platform_users(null, null, 100, 0, true)
             where profile_id = :'custA'),
            '★★ ومن بلا متجر ضمنهم');
select t.ok((select count(*) = 1 from platform_users(null, null, 100, 0, true)
             where profile_id = :'ownerB'),
            '★★ ومن لم يؤكّد بريده ضمنهم ولو ملك متجرًا');
select t.ok((select count(*) = 1 from platform_users()
             where profile_id = :'ownerA'),
            'والقائمة بلا ترشيح تضمّ الجميع');
rollback;

\echo '── البحث يشمل الرقم ──'
begin;
select t.reset();
update profiles set phone = '249955555555' where id = :'ownerA';
select t.login(:'adminOwner');
select t.ok((select count(*) = 1 from platform_users('955555')
             where profile_id = :'ownerA'),
            '★ البحث برقم الهاتف يجد صاحبه');
rollback;


\echo '── الرقم بعد Google: الملف يقبل تعديل صاحبه وحده ──'
begin;
select t.reset();
update profiles set phone = null where id = :'custA';
select t.login(:'custA');
update profiles set phone = '249966666666' where id = :'custA';
select t.reset();
select t.ok((select phone = '249966666666' from profiles where id = :'custA'),
            '★ صاحب الحساب يضيف رقمه بنفسه (خطوة ما بعد Google)');
rollback;

begin;
select t.reset();
update profiles set phone = null where id = :'ownerB';
select t.login(:'custA');
select t.no_effect('update profiles set phone = ''249900000000'' where id = '
                   || quote_literal(:'ownerB'),
                   '★★★ ولا يضيف رقمًا لحساب غيره');
rollback;

begin;
select t.reset();
select t.login(:'custA');
-- الحارس في 0002/0035 يردّ الأعمدة الحسّاسة في نفس التحديث
update profiles set phone = '249977777777', is_platform_staff = true
 where id = :'custA';
select t.reset();
select t.ok((select phone = '249977777777' and not is_platform_staff
             from profiles where id = :'custA'),
            '★★★ والرقم يُحفظ بينما تُردّ محاولة رفع الصلاحية في نفس التحديث');
rollback;

\echo '── ملف المتجر في لوحة الإدارة ──'
begin;
select t.reset();
select t.login(:'adminOwner');
select t.ok((select (admin_store_detail(:'A') -> 'store' ->> 'slug') = 'store-a'),
            '★ موظف stores:view يفتح ملف أي متجر');
select t.ok((select (admin_store_detail(:'A') -> 'owner' ->> 'email')
             = 'ownerA@test.local'),
            'ومعه صاحب المتجر للتواصل');
select t.ok((select (admin_store_detail(:'A') -> 'counts' ->> 'products')::int = 2),
            'وأعداد نشاطه');
select t.ok((select (admin_store_detail(:'A') -> 'partner' ->> 'name')
             = 'الشريك الأول'),
            '★ ومَن أحاله إن كان جاء عبر مسوّق');
select t.ok((select jsonb_array_length(admin_store_detail(:'A') -> 'domains') >= 1),
            'ونطاقه لفتحه');

select t.login(:'ownerB');
select t.throws('select admin_store_detail(' || quote_literal(:'A') || ')',
                '★★★ ولا يفتحه تاجر آخر');
select t.login(:'custA');
select t.throws('select admin_store_detail(' || quote_literal(:'A') || ')',
                '★★★ ولا مستخدم عادي');
select t.logout();
select t.throws('select admin_store_detail(' || quote_literal(:'A') || ')',
                '★★★ ولا زائر');

select t.login(:'adminOwner');
select t.throws('select admin_store_detail('
                || quote_literal('00000000-0000-0000-0000-0000000000ff') || ')',
                '★ ومتجر غير موجود يُرفض صراحةً');
rollback;

\echo '✓ اختبارات هاتف التسجيل وملف المتجر مرّت'
