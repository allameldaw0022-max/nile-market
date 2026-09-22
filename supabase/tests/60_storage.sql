\set QUIET on
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

\set A a0000000-0000-0000-0000-00000000000a
\set B b0000000-0000-0000-0000-00000000000b
\set ownerA 11111111-1111-1111-1111-111111111111
\set ownerB 22222222-2222-2222-2222-222222222222
\set csA    66666666-6666-6666-6666-666666666666
\set custA  77777777-7777-7777-7777-777777777777
\set adminSup 99999999-9999-9999-9999-999999999999

\echo '── إعداد الـBuckets ──'
begin;
select t.reset();
select t.ok((select public from storage.buckets where id = 'store-public'),
            'store-public عام للقراءة');
select t.ok((select not public from storage.buckets where id = 'store-private'),
            '★ store-private غير عام');
select t.ok((select not public from storage.buckets where id = 'support-attachments'),
            '★ مرفقات الدعم غير عامة');
select t.ok((select not ('image/svg+xml' = any(allowed_mime_types))
             from storage.buckets where id = 'store-public'),
            '★ SVG مرفوض في كل الـbuckets (ناقل XSS)');
select t.ok((select file_size_limit = 5242880 from storage.buckets where id = 'store-public'),
            'حد حجم الأصول العامة 5 ميجابايت');
rollback;

\echo '── prepare_upload: التحقق قبل الرفع ──'
begin;
select t.login(:'ownerA');
select t.ok((select bucket = 'store-public' from prepare_upload(
               :'A', 'product_image', 'image/webp', 100000, 'webp')),
            'صورة منتج ⇒ store-public');
select t.ok((select bucket = 'store-private' from prepare_upload(
               :'A', 'payment_proof', 'image/jpeg', 100000, 'jpg')),
            '★ إثبات التحويل ⇒ store-private');
select t.ok((select path like 'stores/' || :'A' || '/products/%' from prepare_upload(
               :'A', 'product_image', 'image/webp', 100000, 'webp')),
            'المسار يبدأ بمعرّف المتجر');

select t.throws('select prepare_upload(' || quote_literal(:'A')
                || ', ''product_image'', ''image/svg+xml'', 1000, ''svg'')',
                '★ رفع SVG مرفوض');
select t.throws('select prepare_upload(' || quote_literal(:'A')
                || ', ''product_image'', ''application/x-sh'', 1000, ''sh'')',
                '★ رفع ملف تنفيذي مرفوض');
select t.throws('select prepare_upload(' || quote_literal(:'A')
                || ', ''product_image'', ''image/webp'', 99999999, ''webp'')',
                '★ ملف يتجاوز حد الحجم مرفوض');
select t.throws('select prepare_upload(' || quote_literal(:'B')
                || ', ''product_image'', ''image/webp'', 1000, ''webp'')',
                '★ الرفع لمتجر آخر مرفوض');
rollback;

\echo '── الصلاحية حسب الغرض ──'
begin;
select t.login(:'csA');
select t.throws('select prepare_upload(' || quote_literal(:'A')
                || ', ''product_image'', ''image/webp'', 1000, ''webp'')',
                'خدمة العملاء لا ترفع صور منتجات');
select t.throws('select prepare_upload(' || quote_literal(:'A')
                || ', ''payment_proof'', ''image/jpeg'', 1000, ''jpg'')',
                'خدمة العملاء لا ترفع إثبات تحويل');
rollback;

\echo '── سياسات storage.objects: القراءة ──'
begin;
select t.reset();
-- ملفان: أحدهما عام لمتجر A والآخر خاص
insert into storage.buckets (id, name, public) values ('t','t',false) on conflict do nothing;
insert into storage.objects (bucket_id, name) values
  ('store-public',  'stores/' || :'A' || '/products/img-a.webp'),
  ('store-public',  'stores/' || :'B' || '/products/img-b.webp'),
  ('store-private', 'stores/' || :'A' || '/payment-proofs/proof-a.jpg'),
  ('store-private', 'stores/' || :'B' || '/payment-proofs/proof-b.jpg');

select t.logout();
select t.ok((select count(*) = 2 from storage.objects where bucket_id = 'store-public'),
            'الزائر يقرأ الأصول العامة للمتاجر النشطة');
select t.empty('select 1 from storage.objects where bucket_id = ''store-private''',
               '★ الزائر لا يقرأ أي ملف خاص إطلاقًا');

select t.login(:'ownerA');
select t.ok((select count(*) = 1 from storage.objects where bucket_id = 'store-private'),
            'مالك A يقرأ إثباته هو فقط');
select t.ok((select name like '%proof-a%' from storage.objects where bucket_id = 'store-private'),
            '★ ولا يقرأ إثبات متجر B');

select t.login(:'csA');
select t.empty('select 1 from storage.objects where bucket_id = ''store-private''',
               '★ خدمة العملاء لا تقرأ إثباتات التحويل');

select t.login(:'custA');
select t.empty('select 1 from storage.objects where bucket_id = ''store-private''',
               '★ العميل لا يقرأ أي ملف خاص');
rollback;

\echo '── سياسات storage.objects: الكتابة ──'
begin;
select t.reset();
select t.login(:'ownerA');
insert into storage.objects (bucket_id, name)
values ('store-public', 'stores/' || :'A' || '/products/mine.webp');
select t.ok(true, 'مالك A يرفع في مجلد متجره');

select t.throws(
  'insert into storage.objects (bucket_id, name) values (''store-public'', ''stores/'
  || :'B' || '/products/hack.webp'')',
  '★ مالك A لا يرفع في مجلد متجر B');

select t.throws(
  'insert into storage.objects (bucket_id, name) values (''store-public'', ''evil/x.webp'')',
  '★ مسار خارج اتفاقية stores/<id> مرفوض');

select t.login(:'custA');
select t.throws(
  'insert into storage.objects (bucket_id, name) values (''store-public'', ''stores/'
  || :'A' || '/products/x.webp'')',
  '★ عميل لا يرفع في أي متجر');
rollback;

\echo '── إثبات التحويل: لا تعديل ولا حذف (سجل مالي) ──'
begin;
select t.reset();
insert into storage.objects (bucket_id, name)
values ('store-private', 'stores/' || :'A' || '/payment-proofs/p.jpg');
select t.login(:'ownerA');
select t.no_effect('update storage.objects set name = ''stores/' || :'A'
                   || '/payment-proofs/changed.jpg'' where name like ''%p.jpg''',
                   '★ لا يُستبدل إثبات تحويل');
select t.no_effect('delete from storage.objects where bucket_id = ''store-private''',
                   '★ لا يُحذف إثبات تحويل');
rollback;

\echo '── مرفقات الدعم: صاحب التذكرة أو الدعم فقط ──'
begin;
select t.reset();
insert into support_tickets (id, requester_id, requester_kind, store_id, subject)
values ('7c000000-0000-0000-0000-00000000000c', :'ownerA', 'merchant', :'A', 'تذكرة بمرفق');
insert into storage.objects (bucket_id, name)
values ('support-attachments', 'tickets/7c000000-0000-0000-0000-00000000000c/file.pdf');

select t.login(:'ownerA');
select t.ok((select count(*) = 1 from storage.objects where bucket_id = 'support-attachments'),
            'صاحب التذكرة يقرأ مرفقه');

select t.login(:'adminSup');
select t.ok((select count(*) = 1 from storage.objects where bucket_id = 'support-attachments'),
            'موظف الدعم يقرأ المرفق');

select t.login(:'ownerB');
select t.empty('select 1 from storage.objects where bucket_id = ''support-attachments''',
               '★ تاجر آخر لا يقرأ مرفق تذكرة غيره');

select t.logout();
select t.empty('select 1 from storage.objects where bucket_id = ''support-attachments''',
               '★ الزائر لا يقرأ مرفقات الدعم');
rollback;

\echo '── حصة التخزين من الباقة ──'
begin;
select t.reset();
update plan_entitlements set limit_value = 0
 where feature_key = 'storage.mb'
   and plan_id = (select plan_id from subscriptions where store_id = :'A');
select t.login(:'ownerA');
select t.throws('select prepare_upload(' || quote_literal(:'A')
                || ', ''product_image'', ''image/webp'', 1000, ''webp'')',
                '★ الرفع مرفوض عند بلوغ حصة التخزين');
rollback;

\echo '✓ اختبارات التخزين مرّت'
