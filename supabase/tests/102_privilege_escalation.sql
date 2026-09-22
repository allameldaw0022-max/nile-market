\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set adminOwner 88888888-8888-8888-8888-888888888888
\set adminSup 99999999-9999-9999-9999-999999999999
\set adminFin aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
\set adminOps cccccccc-cccc-cccc-cccc-cccccccccccc
\set ownerA 11111111-1111-1111-1111-111111111111
\set opsMember ad000000-0000-0000-0000-00000000000d

\echo '── تصعيد الصلاحيات الذاتي ──'
begin;
select t.reset();
insert into admin_permissions (admin_member_id, section, level)
values (:'opsMember', 'settings', 'manage') on conflict do nothing;

select t.login(:'adminOps');
select t.ok((select not app.has_platform_permission('payouts', 'approve')),
            'موظف الإعدادات لا يملك اعتماد الصرف ابتداءً');

-- ★★ الثغرة المُصلَحة: الكتابة المباشرة على الجدول كانت تمنحه الملكية
select t.throws('update admin_members set is_owner = true where profile_id = '
                || quote_literal(:'adminOps'),
                '★★★ لا يمنح موظفٌ نفسَه ملكية المنصة بكتابة مباشرة');
select t.throws('update admin_members set status = ''active'', is_owner = true '
                || 'where profile_id = ' || quote_literal(:'adminOps'),
                '★★ ولا بتمريرها ضمن تحديث آخر');
select t.throws('update admin_members set mfa_required = false where profile_id = '
                || quote_literal(:'adminOps'),
                '★★ ولا يُسقط عن نفسه التحقق بخطوتين (D28)');
select t.throws('update admin_members set status = ''suspended'' where profile_id = '
                || quote_literal(:'adminOps'),
                '★ ولا يغيّر حالة حسابه');

select t.reset();
select t.ok((select not is_owner from admin_members where profile_id = :'adminOps'),
            'والحساب يبقى غير مالك');
rollback;

\echo '── تنصيب مالك ثانٍ للالتفاف على فصل المهام ──'
begin;
select t.reset();
insert into admin_permissions (admin_member_id, section, level)
values (:'opsMember', 'settings', 'manage') on conflict do nothing;
insert into auth.users (id, email, email_confirmed_at)
values ('e7000000-0000-0000-0000-00000000000e', 'puppet@test.local', now());

select t.login(:'adminOps');
select t.throws($$insert into admin_members (profile_id, display_name, is_owner, status)
                 values ('e7000000-0000-0000-0000-00000000000e','دمية',true,'active')$$,
                '★★★ موظف غير مالك لا يُنصّب حساب مالك جديد');
select t.throws($$insert into admin_members (profile_id, display_name, is_owner, status)
                 values ('cccccccc-cccc-cccc-cccc-cccccccccccc','أنا',true,'active')$$,
                '★★ ولا يُنشئ حساب إدارة لنفسه');

-- الموظف العادي (بلا ملكية) يُنشأ عاديًا
select t.login(:'adminOps');
insert into admin_members (profile_id, display_name, is_owner, status)
values ('e7000000-0000-0000-0000-00000000000e','موظف عادي',false,'active');
select t.reset();
select t.ok((select not is_owner from admin_members
             where profile_id = 'e7000000-0000-0000-0000-00000000000e'),
            'وإنشاء موظف عادي يمرّ');

-- المالك وحده يمنح الملكية
select t.login(:'adminOwner');
update admin_members set is_owner = true
 where profile_id = 'e7000000-0000-0000-0000-00000000000e';
select t.reset();
select t.ok((select is_owner from admin_members
             where profile_id = 'e7000000-0000-0000-0000-00000000000e'),
            '★ ومالك المنصة يمنح الملكية');
rollback;

\echo '── صلاحيات الأقسام: لا تعديل ذاتي ──'
begin;
select t.reset();
insert into admin_permissions (admin_member_id, section, level)
values (:'opsMember', 'settings', 'manage') on conflict do nothing;
select t.login(:'adminOps');
select t.throws($$insert into admin_permissions (admin_member_id, section, level)
                 values ('ad000000-0000-0000-0000-00000000000d','payouts','approve')$$,
                '★★ لا يمنح موظف نفسه صلاحية قسم');
select t.throws($$update admin_permissions set level = 'manage'
                 where admin_member_id = 'ad000000-0000-0000-0000-00000000000d'$$,
                '★★ ولا يرفع مستوى صلاحيته');
rollback;

\echo '── صفة موظف المنصة في profiles ──'
begin;
select t.reset();
-- الحارس يردّ القيمة بصمت بدل رفض التحديث كلّه: التاجر يعدّل اسمه
-- وهاتفه في نفس الصف، فرفض التحديث كان سيمنعه من تعديل ما يملكه.
select t.login(:'ownerA');
update profiles set is_platform_staff = true, full_name = 'اسم جديد'
 where id = :'ownerA';
select t.reset();
select t.ok((select not is_platform_staff from profiles where id = :'ownerA'),
            '★★★ التاجر لا يرفع عن نفسه صفة موظف المنصة');
select t.ok((select full_name = 'اسم جديد' from profiles where id = :'ownerA'),
            '★ ويبقى قادرًا على تعديل ما يملكه في نفس الصف');

-- ★ الصفة تُشتق من admin_members لا تُكتب يدويًا
select t.reset();
select t.ok((select is_platform_staff from profiles where id = :'adminOwner'),
            '★★ وصفة موظف المنصة مضبوطة فعلًا (كانت false دائمًا)');
rollback;

begin;
select t.reset();
update admin_members set status = 'suspended' where profile_id = :'adminSup';
select t.ok((select not is_platform_staff from profiles where id = :'adminSup'),
            '★★ وإيقاف الموظف يُسقط صفته تلقائيًا');
update admin_members set status = 'active' where profile_id = :'adminSup';
select t.ok((select is_platform_staff from profiles where id = :'adminSup'),
            '★ وإعادة تفعيله تعيدها');
rollback;
select t.reset();

\echo '✓ اختبارات تصعيد الصلاحيات مرّت'
