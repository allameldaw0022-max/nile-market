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
\set adminFin aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
\set P1 d1000000-0000-0000-0000-000000000001
\set PB d2000000-0000-0000-0000-000000000001
\set TOKEN proof-guest-token-0123456789abcd
\set TOKEN2 proof-other-token-9876543210ab

-- =====================================================================
-- (أ) اشتراك المنصة: التاجر يرفع · موظف المنصة يعتمد
-- =====================================================================

\echo '── إيصال الاشتراك: إلزامي، ولا يُفعّل باقة بذاته ──'
begin;
select t.reset();
select id as basicid from plans where code = 'basic'
\gset

select t.login(:'ownerA');
select t.throws('select submit_subscription_request(' || quote_literal(:'A') || ', '
                || quote_literal(:'basicid') || ')',
                '★★ طلب اشتراك بلا إيصال مرفوض');

select t.sub_proof(:'A') as proof_a
\gset
select t.ok((select bucket = 'store-private' from media_files where id = :'proof_a'),
            'الإيصال في الدلو الخاص لا العام');
select t.ok((select path like 'stores/' || :'A' || '/payment-proofs/%'
             from media_files where id = :'proof_a'),
            'وفي مجلد إيصالات الاشتراك تحت معرّف المتجر');

select request_id as reqid from submit_subscription_request(
  :'A', :'basicid', 'TRX-SUB-1', :'proof_a')
\gset
select t.ok((select proof_media_id = :'proof_a' and status = 'pending'
             from subscription_requests where id = :'reqid'),
            '★ الإيصال مرتبط بالطلب نفسه، والحالة «قيد المراجعة»');
select t.ok((select net_amount = 20000 from subscription_requests where id = :'reqid'),
            '★ المبلغ من سعر الباقة في القاعدة لا من المتصفح');
select t.ok((select count(*) = 0 from subscriptions
             where store_id = :'A' and plan_id = :'basicid'),
            '★★★ رفع الإيصال وحده لا يُفعّل الباقة المطلوبة');
select t.ok((select count(*) = 0 from payments
             where kind = 'subscription' and store_id = :'A'),
            '★★ ولا يُقيّد دفعة');

-- الإيصال لا يُعاد استخدامه لعملية ثانية
select cancel_subscription_request(:'reqid');
select t.throws('select submit_subscription_request(' || quote_literal(:'A') || ', '
                || quote_literal(:'basicid') || ', null, ' || quote_literal(:'proof_a') || ')',
                '★★ إيصال مرتبط بعملية سابقة لا يُرفق بعملية أخرى');
rollback;

\echo '── الإيصال لا يعبر حدود المستأجر ──'
begin;
select t.reset();
select id as basicid from plans where code = 'basic'
\gset
select t.login(:'ownerB');
select t.sub_proof(:'B') as proof_b
\gset
select t.login(:'ownerA');
select t.throws('select submit_subscription_request(' || quote_literal(:'A') || ', '
                || quote_literal(:'basicid') || ', null, ' || quote_literal(:'proof_b') || ')',
                '★★★ تاجر أ لا يُرفق إيصال متجر ب بطلبه');
select t.throws('select 1 from prepare_upload(' || quote_literal(:'B')
                || ', ''payment_proof'', ''image/jpeg'', 1000, ''jpg'')',
                '★★ ولا يرفع إيصالًا باسم متجر ب أصلًا');
rollback;

\echo '── موظف المنصة يرى الإيصال ثم يقرّر ──'
begin;
select t.reset();
select id as basicid from plans where code = 'basic'
\gset
select t.login(:'ownerA');
select t.sub_proof(:'A') as proof_a
\gset
select request_id as reqid from submit_subscription_request(
  :'A', :'basicid', 'TRX-SUB-2', :'proof_a')
\gset

select t.login(:'adminFin');
select t.ok((select path like 'stores/' || :'A' || '/payment-proofs/%'
             from subscription_request_proof(:'reqid')),
            '★ موظف الاشتراكات يقرأ مسار الإيصال ليوقّع له رابطًا');
select t.ok((select count(*) = 1 from storage.objects o
             join subscription_request_proof(:'reqid') p
               on p.bucket = o.bucket_id and p.path = o.name),
            '★ ويقرأ الكائن نفسه من التخزين (لتوقيع الرابط)');

select t.login(:'adminSup');
select t.throws('select 1 from subscription_request_proof(' || quote_literal(:'reqid') || ')',
                '★★ وموظف بلا صلاحية اشتراكات لا يرى الإيصال');

select t.login(:'ownerB');
select t.throws('select 1 from subscription_request_proof(' || quote_literal(:'reqid') || ')',
                '★★★ ولا تاجر آخر');
select t.empty('select 1 from storage.objects where bucket_id = ''store-private''
                and name like ''stores/' || :'A' || '/payment-proofs/%''',
               '★★★ ولا يقرأ ملف إيصال متجر ليس له');

select t.logout();
select t.empty('select 1 from storage.objects where bucket_id = ''store-private''',
               '★★★ والزائر لا يصل إلى أي ملف خاص (الدلو ليس عامًا)');

-- الاعتماد يُفعّل
select t.login(:'adminFin');
\o /dev/null
select review_subscription_request(:'reqid', 'approve');
\o
select t.reset();
select t.ok((select status = 'active' and plan_id = :'basicid'
             from subscriptions where store_id = :'A'),
            '★★ الاعتماد — لا الرفع — هو ما يُفعّل الباقة المطلوبة');
select t.ok((select proof_media_id = :'proof_a' from payments
             where kind = 'subscription' and store_id = :'A'),
            '★ والدفعة المقيَّدة تحمل نفس الإيصال');
rollback;

begin;
select t.reset();
select id as basicid from plans where code = 'basic'
\gset
select t.login(:'ownerA');
select t.sub_proof(:'A') as proof_a
\gset
select request_id as reqid from submit_subscription_request(
  :'A', :'basicid', null, :'proof_a')
\gset
select t.login(:'adminFin');
\o /dev/null
select review_subscription_request(:'reqid', 'reject', 'الإيصال غير واضح');
\o
select t.reset();
select t.ok((select status = 'rejected' and rejection_reason = 'الإيصال غير واضح'
             from subscription_requests where id = :'reqid'),
            'الرفض يُسجَّل بسببه');
select t.ok((select count(*) = 0 from subscriptions
             where store_id = :'A' and plan_id = :'basicid'),
            '★★★ والرفض لا يُفعّل الباقة المطلوبة');
rollback;

-- =====================================================================
-- (ب) تحويل طلب المتجر: الزبون يرفع · التاجر يؤكّد
-- =====================================================================

\echo '── إيصال الطلب: لا يُرفع إلا من سلة قائمة ──'
begin;
select t.reset();
select t.logout();
select t.throws('select 1 from prepare_order_proof_upload(' || quote_literal(:'A')
                || ', ' || quote_literal(:'TOKEN') || ', ''image/jpeg'', 1000, ''jpg'')',
                '★★ بلا سلة لا تذكرة رفع (لا يُستنزف تخزين التاجر)');
\o /dev/null
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN');
\o
select t.ok((select bucket = 'store-private' from prepare_order_proof_upload(
               :'A', :'TOKEN', 'image/jpeg', 90000, 'jpg')),
            'ومع سلة غير فارغة: تذكرة في الدلو الخاص');
select t.ok((select path like 'stores/' || :'A' || '/order-payment-proofs/%'
             from prepare_order_proof_upload(:'A', :'TOKEN', 'image/jpeg', 90000, 'jpg')),
            '★ في مجلد مستقل تمامًا عن إيصالات الاشتراك');
select t.throws('select 1 from prepare_order_proof_upload(' || quote_literal(:'A')
                || ', ' || quote_literal(:'TOKEN') || ', ''image/svg+xml'', 1000, ''svg'')',
                '★★ وSVG مرفوض هنا أيضًا');
select t.throws('select 1 from prepare_order_proof_upload(' || quote_literal(:'A')
                || ', ' || quote_literal(:'TOKEN') || ', ''image/jpeg'', 99999999, ''jpg'')',
                '★ وملف أكبر من حد الدلو مرفوض');
rollback;

\echo '── الطلب بالتحويل: الإيصال شرط الإتمام ──'
begin;
select t.reset();
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN');
\o
select t.throws('select 1 from create_order_with_proof(' || quote_literal(:'A')
                || ', ''[{"product_id":"' || :'P1' || '","quantity":1}]''::jsonb, null,'
                || ' ''{"name":"زبون","phone":"0911111111"}''::jsonb, ''{}''::jsonb,'
                || ' ''bank_transfer'', null, null, ''k1'', null, null, '
                || quote_literal(:'TOKEN') || ')',
                '★★★ إتمام طلب تحويل بلا إيصال مرفوض');

select t.order_proof(:'A', :'TOKEN') as proof1
\gset
select order_id as oid1 from create_order_with_proof(
  :'A', ('[{"product_id":"' || :'P1' || '","quantity":1}]')::jsonb, null,
  '{"name":"زبون","phone":"0911111111"}'::jsonb, '{}'::jsonb,
  'bank_transfer', :'proof1', null, 'k-ok-1', null, 'TRX-ORD-1', :'TOKEN')
\gset

select t.reset();
select t.ok((select payment_status = 'pending' from orders where id = :'oid1'),
            '★★★ الطلب يصل التاجر بحالة «بانتظار التحقق» لا «مدفوع»');
select t.ok((select paid_total = 0 from orders where id = :'oid1'),
            '★★ ولا قرش واحد مُقيَّد مدفوعًا برفع الإيصال');
select t.ok((select status = 'pending' and proof_media_id = :'proof1'
             and amount = (select total from orders where id = :'oid1')
             from payments where order_id = :'oid1'),
            '★★ الدفعة معلّقة، بالإيصال، وبمبلغ محسوب في القاعدة');
select t.ok((select status = 'ready' from media_files where id = :'proof1'),
            'والإيصال صار جاهزًا بعد ربطه');

-- إيصال واحد لطلب واحد
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN');
\o
select t.throws('select 1 from create_order_with_proof(' || quote_literal(:'A')
                || ', ''[{"product_id":"' || :'P1' || '","quantity":1}]''::jsonb, null,'
                || ' ''{"name":"زبون","phone":"0911111111"}''::jsonb, ''{}''::jsonb,'
                || ' ''bank_transfer'', ' || quote_literal(:'proof1')
                || ', null, ''k-ok-2'', null, null, ' || quote_literal(:'TOKEN') || ')',
                '★★ إيصال مرتبط بطلب لا يُرفق بطلب ثانٍ');
rollback;

\echo '── الإيصال لا يعبر سلة ولا متجرًا ──'
begin;
select t.reset();
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN');
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN2');
\o
select t.order_proof(:'A', :'TOKEN2') as proof_other
\gset
select t.throws('select 1 from create_order_with_proof(' || quote_literal(:'A')
                || ', ''[{"product_id":"' || :'P1' || '","quantity":1}]''::jsonb, null,'
                || ' ''{"name":"زبون","phone":"0911111111"}''::jsonb, ''{}''::jsonb,'
                || ' ''bank_transfer'', ' || quote_literal(:'proof_other')
                || ', null, ''k-x1'', null, null, ' || quote_literal(:'TOKEN') || ')',
                '★★★ إيصال زبون آخر لا يُرفق بطلب هذا الزبون');

\o /dev/null
select cart_add_item(:'B', :'PB', 1, null, :'TOKEN');
\o
select t.order_proof(:'B', :'TOKEN') as proof_store_b
\gset
select t.throws('select 1 from create_order_with_proof(' || quote_literal(:'A')
                || ', ''[{"product_id":"' || :'P1' || '","quantity":1}]''::jsonb, null,'
                || ' ''{"name":"زبون","phone":"0911111111"}''::jsonb, ''{}''::jsonb,'
                || ' ''bank_transfer'', ' || quote_literal(:'proof_store_b')
                || ', null, ''k-x2'', null, null, ' || quote_literal(:'TOKEN') || ')',
                '★★★ ولا إيصال رُفع في متجر ب يُرفق بطلب في متجر أ');
rollback;

\echo '── التاجر يرى الإيصال ويقرّر — ولا يراه غيره ──'
begin;
select t.reset();
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN');
\o
select t.order_proof(:'A', :'TOKEN') as proof1
\gset
select order_id as oid1 from create_order_with_proof(
  :'A', ('[{"product_id":"' || :'P1' || '","quantity":1}]')::jsonb, null,
  '{"name":"زبون","phone":"0911111111"}'::jsonb, '{}'::jsonb,
  'bank_transfer', :'proof1', null, 'k-rev-1', null, 'TRX-ORD-9', :'TOKEN')
\gset

select t.login(:'ownerA');
select t.ok((select path like 'stores/' || :'A' || '/order-payment-proofs/%'
             from order_payment_proofs(:'oid1')),
            '★ التاجر يقرأ مسار إيصال طلبه');
select t.ok((select count(*) = 1 from storage.objects o
             join order_payment_proofs(:'oid1') p
               on p.bucket = o.bucket_id and p.path = o.name),
            '★ ويقرأ الكائن نفسه (ليوقّع رابطًا قصير العمر)');

select t.login(:'ownerB');
select t.throws('select 1 from order_payment_proofs(' || quote_literal(:'oid1') || ')',
                '★★★ وصاحب متجر ب لا يرى إيصال طلب في متجر أ');
select t.empty('select 1 from storage.objects where bucket_id = ''store-private''
                and name like ''stores/' || :'A' || '/order-payment-proofs/%''',
               '★★★ ولا يصل إلى ملفه');

select t.login(:'custA');
select t.throws('select 1 from order_payment_proofs(' || quote_literal(:'oid1') || ')',
                '★★ ولا زبون مسجَّل في المتجر نفسه');

select t.logout();
select t.empty('select 1 from media_files where purpose = ''order_payment_proof''',
               '★★★ والزائر لا يقرأ صفوف الإيصالات أصلًا');

-- التأكيد فعل صريح من مخوَّل
select t.reset();
select id as pid from payments where order_id = :'oid1'
\gset
select t.login(:'csA');
select t.throws('select review_order_payment(' || quote_literal(:'pid') || ', ''approve'')',
                '★★ خدمة العملاء لا تؤكّد دفعة (لا تملك orders:payment)');
select t.login(:'ownerA');
select t.throws('select review_order_payment(' || quote_literal(:'pid') || ', ''reject'')',
                '★ والرفض بلا سبب مرفوض');
select review_order_payment(:'pid', 'approve');
select t.reset();
select t.ok((select payment_status = 'paid' from orders where id = :'oid1'),
            '★★★ تأكيد التاجر — لا رفع الزبون — هو ما يُعلن الدفع');
select t.ok((select confirmed_by = :'ownerA' and status = 'paid'
             from payments where id = :'pid'),
            'والدفعة تحمل اسم من أكّدها ووقتها');
select t.login(:'ownerA');
select t.throws('select review_order_payment(' || quote_literal(:'pid') || ', ''reject'', ''تراجعت'')',
                '★★ ودفعة مؤكَّدة لا تُراجَع مرة أخرى');
rollback;

\echo '── الرفض يُبقي الطلب غير مدفوع ──'
begin;
select t.reset();
select t.logout();
\o /dev/null
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN');
\o
select t.order_proof(:'A', :'TOKEN') as proof1
\gset
select order_id as oid1 from create_order_with_proof(
  :'A', ('[{"product_id":"' || :'P1' || '","quantity":1}]')::jsonb, null,
  '{"name":"زبون","phone":"0911111111"}'::jsonb, '{}'::jsonb,
  'bank_transfer', :'proof1', null, 'k-rej-1', null, null, :'TOKEN')
\gset
select t.reset();
select id as pid from payments where order_id = :'oid1'
\gset
select t.login(:'ownerA');
select review_order_payment(:'pid', 'reject', 'لم يصل التحويل');
select t.reset();
select t.ok((select payment_status = 'unpaid' from orders where id = :'oid1'),
            '★★ الرفض يعيد الطلب إلى «غير مدفوع» بمنطق العمل القائم');
select t.ok((select failed_reason = 'لم يصل التحويل' from payments where id = :'pid'),
            'والسبب محفوظ في الدفعة');
select t.ok((select status = 'new' from orders where id = :'oid1'),
            '★ ولا يُلغى الطلب — القرار للتاجر لا للنظام');
select t.ok((select count(*) = 2 from payment_events where payment_id = :'pid'),
            'وسجل أحداث الدفعة يحفظ المسار كاملًا');
rollback;

\echo '── بيانات التحويل قبل الطلب: لمن له سلة فقط ──'
begin;
select t.reset();
select t.logout();
select t.empty('select 1 from checkout_payment_info(' || quote_literal(:'A')
               || ', ' || quote_literal(:'TOKEN') || ')',
               '★★ متصفّح بلا سلة لا يرى حساب التاجر البنكي');
\o /dev/null
select cart_add_item(:'A', :'P1', 1, null, :'TOKEN');
\o
select t.ok((select jsonb_array_length(bank_accounts) = 1
             from checkout_payment_info(:'A', :'TOKEN')),
            'ومن له سلة يرى الحساب ليحوّل قبل إتمام الطلب');
select t.empty('select 1 from checkout_payment_info(' || quote_literal(:'A')
               || ', ' || quote_literal(:'TOKEN2') || ')',
               '★★ وتوكن آخر لا يرى شيئًا');
rollback;

\echo '── الحاجز الأخير: لا التفاف على شرط الإيصال ──'
begin;
select t.reset();
select t.logout();
\o /dev/null
select create_order(
  :'A', ('[{"product_id":"' || :'P1' || '","quantity":1}]')::jsonb, null,
  '{"name":"ملتف","phone":"0912222222"}'::jsonb, '{}'::jsonb, 'bank_transfer',
  null, 'k-bypass', null, null);
\o
select t.throws('set constraints orders_transfer_proof immediate',
                '★★★ طلب تحويل بلا إيصال لا يُثبَّت ولو نودي المسار المباشر');
rollback;

\echo '✓ اختبارات إيصالات التحويل مرّت'
