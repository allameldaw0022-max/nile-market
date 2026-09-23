\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set customerA 77777777-7777-7777-7777-777777777777
\set adminSup 99999999-9999-9999-9999-999999999999

-- =====================================================================
-- مرفقات الدعم — الرفع والربط والعزل
-- =====================================================================

\echo '── تذكرتان لمستخدمين مختلفين ──'
begin;
select t.reset();
insert into public.support_tickets (id, ticket_number, requester_id, requester_kind,
                                    store_id, subject, category)
values ('e1000000-0000-0000-0000-000000000001', 'T-9001', :'ownerA', 'merchant',
        :'A', 'تذكرة أ', 'other'),
       ('e1000000-0000-0000-0000-000000000002', 'T-9002', :'ownerB', 'merchant',
        null, 'تذكرة ب', 'other');

\echo '── التحضير: النوع والحجم والملكيّة ──'
select t.login(:'ownerA');
select t.ok((select count(*) from public.prepare_support_upload(
              'e1000000-0000-0000-0000-000000000001', 'image/png', 1024)) = 1,
            'صاحب التذكرة يحضّر رفعًا صالحًا');
select t.ok((select bucket from public.prepare_support_upload(
              'e1000000-0000-0000-0000-000000000001', 'image/png', 1024))
            = 'support-attachments',
            '★★ والدلو هو الخاصّ لا العامّ');
select t.ok((select path from public.prepare_support_upload(
              'e1000000-0000-0000-0000-000000000001', 'image/png', 1024))
            like 'tickets/e1000000-0000-0000-0000-000000000001/%',
            '★★★ والمسار مُولَّد خادميًا داخل مجلّد التذكرة');

select t.throws('select * from public.prepare_support_upload(
                   ''e1000000-0000-0000-0000-000000000001'', ''application/x-msdownload'', 1024)',
                '★★★ نوع تنفيذي يُرفض');
select t.throws('select * from public.prepare_support_upload(
                   ''e1000000-0000-0000-0000-000000000001'', ''text/html'', 1024)',
                '★★★ وHTML يُرفض (XSS مخزَّن عبر مرفق)');
select t.throws('select * from public.prepare_support_upload(
                   ''e1000000-0000-0000-0000-000000000001'', ''image/png'', 99999999)',
                '★★★ وملفّ يتجاوز الحدّ يُرفض');
select t.throws('select * from public.prepare_support_upload(
                   ''e1000000-0000-0000-0000-000000000001'', ''image/png'', 0)',
                '★★ وحجم صفر يُرفض');

\echo '── ★★★ الرفع إلى تذكرة غيرك ──'
select t.throws('select * from public.prepare_support_upload(
                   ''e1000000-0000-0000-0000-000000000002'', ''image/png'', 1024)',
                '★★★ لا يرفع المستخدم إلى تذكرة غيره');
select t.login(:'customerA');
select t.throws('select * from public.prepare_support_upload(
                   ''e1000000-0000-0000-0000-000000000001'', ''image/png'', 1024)',
                '★★★ ولا طرف ثالث بلا علاقة');
select t.logout();
select t.throws('select * from public.prepare_support_upload(
                   ''e1000000-0000-0000-0000-000000000001'', ''image/png'', 1024)',
                '★★★ ولا الزائر المجهول');
rollback;

\echo '── الربط بالتذكرة ──'
begin;
select t.reset();
insert into public.support_tickets (id, ticket_number, requester_id, requester_kind,
                                    store_id, subject, category)
values ('e1000000-0000-0000-0000-000000000001', 'T-9001', :'ownerA', 'merchant',
        :'A', 'تذكرة أ', 'other'),
       ('e1000000-0000-0000-0000-000000000002', 'T-9002', :'ownerB', 'merchant',
        null, 'تذكرة ب', 'other');

select t.login(:'ownerA');
create temporary table tk as
  select * from public.prepare_support_upload(
    'e1000000-0000-0000-0000-000000000001', 'image/png', 2048);

select t.ok((select public.attach_to_ticket(
               'e1000000-0000-0000-0000-000000000001', (select media_id from tk)))
            is not null,
            'الربط ينجح لملفّ هذه التذكرة');
select t.ok((select status from public.media_files where id = (select media_id from tk))
            = 'ready',
            'والملف يصير جاهزًا');
select t.ok((select count(*) from public.ticket_attachments(
              'e1000000-0000-0000-0000-000000000001')) = 1,
            'ويظهر في مرفقات التذكرة');

\echo '── ★★★ تهريب مرفق بين تذكرتين ──'
select t.throws('select public.attach_to_ticket(
                   ''e1000000-0000-0000-0000-000000000002'', '
                 || quote_literal((select media_id from tk)::text) || '::uuid)',
                '★★★ ملفّ تذكرة أ لا يُربط بتذكرة ب');
rollback;

\echo '── ★★★ ربط ملفّ لا يملكه ──'
begin;
select t.reset();
insert into public.support_tickets (id, ticket_number, requester_id, requester_kind,
                                    store_id, subject, category)
values ('e1000000-0000-0000-0000-000000000001', 'T-9001', :'ownerA', 'merchant',
        :'A', 'تذكرة أ', 'other');
select t.login(:'ownerA');
create temporary table tk2 as
  select * from public.prepare_support_upload(
    'e1000000-0000-0000-0000-000000000001', 'image/png', 2048);
select t.login(:'ownerB');
select t.throws('select public.attach_to_ticket(
                   ''e1000000-0000-0000-0000-000000000001'', '
                 || quote_literal((select media_id from tk2)::text) || '::uuid)',
                '★★★ لا يربط مستخدم ملفًّا رفعه غيره');
rollback;

\echo '── ★★★ قراءة مرفقات تذكرة غيرك ──'
begin;
select t.reset();
insert into public.support_tickets (id, ticket_number, requester_id, requester_kind,
                                    store_id, subject, category)
values ('e1000000-0000-0000-0000-000000000001', 'T-9001', :'ownerA', 'merchant',
        :'A', 'تذكرة أ', 'other');
insert into public.media_files (id, bucket, path, owner_profile_id, store_id,
                                purpose, mime_type, size_bytes, status)
values ('e2000000-0000-0000-0000-000000000001', 'support-attachments',
        'tickets/e1000000-0000-0000-0000-000000000001/e2000000-0000-0000-0000-000000000001.png',
        :'ownerA', :'A', 'support_attachment', 'image/png', 2048, 'ready');
insert into public.support_attachments (ticket_id, media_file_id, uploaded_by)
values ('e1000000-0000-0000-0000-000000000001',
        'e2000000-0000-0000-0000-000000000001', :'ownerA');

select t.login(:'ownerB');
select t.ok((select count(*) from public.support_attachments) = 0,
            '★★★ مستخدم آخر لا يقرأ صفّ المرفق');
select t.ok((select count(*) from public.ticket_attachments(
              'e1000000-0000-0000-0000-000000000001')) = 0,
            '★★★ ولا عبر دالّة العرض');

select t.login(:'customerA');
select t.ok((select count(*) from public.support_attachments) = 0,
            '★★★ ولا زبون لا علاقة له');

select t.login(:'adminSup');
select t.ok((select count(*) from public.support_attachments) = 1,
            '★★ وموظّف الدعم يقرأ — وهو عمله');

select t.login(:'ownerA');
select t.ok((select count(*) from public.ticket_attachments(
              'e1000000-0000-0000-0000-000000000001')) = 1,
            'وصاحب التذكرة يرى مرفقه');
rollback;

\echo '── المرفقات سجلّ لا يُعدَّل ──'
begin;
select t.reset();
select t.ok((select count(*) from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'support_attachments'
                and grantee = 'anon') = 0,
            '★★ لا منح للدور المجهول على المرفقات');
select t.ok((select count(*) from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'support_attachments'
                and grantee = 'authenticated'
                and privilege_type in ('UPDATE','DELETE','TRUNCATE')) = 0,
            '★★ ولا تعديل ولا حذف ولا تفريغ — سجلّ التذكرة يبقى كما رآه الطرفان');
rollback;

\echo '── الدلو خاصّ ──'
begin;
select t.reset();
select t.ok((select public from storage.buckets where id = 'support-attachments') = false,
            '★★★ دلو المرفقات خاصّ لا عامّ');
select t.ok((select file_size_limit from storage.buckets
              where id = 'support-attachments') = 10485760,
            'وبحدّ حجم مضبوط');
select t.ok(not exists (select 1 from storage.buckets b
                          where b.id = 'support-attachments'
                            and 'text/html' = any(b.allowed_mime_types)),
            '★★★ وHTML ليس ضمن الأنواع المسموحة');
select t.ok(not exists (select 1 from storage.buckets b
                          where b.id = 'support-attachments'
                            and 'image/svg+xml' = any(b.allowed_mime_types)),
            '★★★ ولا SVG — يحمل سكربتًا قابلًا للتنفيذ');
rollback;

select t.reset();
\echo '✓ اختبارات مرفقات الدعم مرّت'
