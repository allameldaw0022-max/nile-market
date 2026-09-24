-- =====================================================================
-- 0045 دورة إثبات التحويل البنكي كاملة (إضافية · لا تمسّ بيانات قائمة)
--
-- نظامان منفصلان تمامًا — لا يتشاركان غرضًا ولا مجلدًا ولا سياسة ولا
-- صلاحية مراجعة:
--
--  (أ) اشتراك المنصة:  التاجر ⟶ سوق النيل
--      الإيصال purpose='payment_proof'  · مجلد payment-proofs
--      يُرفق بـ`subscription_requests`  · يراجعه موظف بصلاحية
--      subscriptions:approve، والتفعيل يمرّ بـ`record_payment` وحدها.
--
--  (ب) تحويل طلب متجر:  زبون المتجر ⟶ التاجر
--      الإيصال purpose='order_payment_proof' · مجلد order-payment-proofs
--      يُرفق بـ`payments` (kind='order', status='pending') ·
--      يراجعه عضو المتجر بصلاحية orders:payment.
--
-- ثوابت تسري على الاثنين:
--   ★ الرفع لا يؤكّد الدفع. الإيصال يُنشئ حالة «بانتظار التحقق» فقط،
--     والتأكيد فعلٌ صريح من المراجع المخوّل.
--   ★ المبلغ والباقة لا يأتيان من المتصفح — يُقرآن من القاعدة.
--   ★ الملفات في دلو خاص، تُقرأ بروابط موقّعة قصيرة العمر فقط.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ربط الإيصال بالسلة التي رفعته
--
-- بلا هذا العمود لا يوجد ما يمنع إرفاق إيصال أُنشئ في سياق آخر بطلب
-- هذا الزبون. السلة هي هوية الزبون قبل وجود الطلب (وهي لمتجر واحد
-- بحكم تصميمها)، فربط الإيصال بها يجعل «إيصال لعملية أخرى» مستحيلًا
-- لا مستبعَدًا.
-- ---------------------------------------------------------------------
alter table public.media_files
  add column if not exists cart_id uuid
    references public.carts (id) on delete set null;

create index if not exists media_files_cart_idx
  on public.media_files (cart_id) where cart_id is not null;

-- =====================================================================
-- (أ) اشتراك المنصة
-- =====================================================================

-- ---------------------------------------------------------------------
-- الإيصال صار **إلزاميًا**: طلب اشتراك بلا إثبات تحويل لا معنى له —
-- يشغل خانة «طلب معلّق واحد» ولا يملك الموظف ما يراجعه.
--
-- ما عدا ذلك كما كان: السعر من `plans`، والباقة تُفحص، والمفتاح
-- يمنع التكرار.
-- ---------------------------------------------------------------------
create or replace function public.submit_subscription_request(
  p_store_id        uuid,
  p_plan_id         uuid,
  p_reference       text default null,
  p_proof_media_id  uuid default null,
  p_idempotency_key text default null
)
returns table (request_id uuid, net_amount numeric)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_key   text := coalesce(nullif(trim(p_idempotency_key), ''), app.random_token(16));
  v_plan  public.plans%rowtype;
  v_exist public.subscription_requests%rowtype;
  v_media public.media_files%rowtype;
  v_id    uuid;
begin
  if not app.has_store_permission(p_store_id, 'subscription:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- نفس المفتاح ⇒ نفس الطلب، لا طلب ثانٍ (§13)
  select * into v_exist from public.subscription_requests
   where idempotency_key = v_key;
  if found then
    return query select v_exist.id, v_exist.net_amount;
    return;
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if not found or not v_plan.is_active then
    raise exception 'NOT_FOUND: الباقة غير متاحة' using errcode = 'P0002';
  end if;
  if not v_plan.is_public then
    raise exception 'NOT_FOUND: الباقة غير متاحة' using errcode = 'P0002';
  end if;
  if v_plan.is_free then
    raise exception 'VALIDATION: الباقة المجانية لا تحتاج طلب اشتراك'
      using errcode = 'P0001';
  end if;
  -- D18: لا سعر مفترض. باقة بلا سعر مضبوط لا تُباع.
  if v_plan.price_configured_at is null then
    raise exception 'VALIDATION: لم يُضبط سعر هذه الباقة بعد — تواصل مع الدعم'
      using errcode = 'P0001';
  end if;

  -- طلب معلّق واحد لكل متجر: طلبان معلّقان يعنيان اعتمادين ودفعتين
  if exists (
    select 1 from public.subscription_requests
    where store_id = p_store_id and status = 'pending'
  ) then
    raise exception 'REQUEST_PENDING: لديك طلب اشتراك قيد المراجعة'
      using errcode = 'P0001';
  end if;

  -- ★ إلزامي
  if p_proof_media_id is null then
    raise exception 'VALIDATION: إرفاق إيصال التحويل مطلوب' using errcode = 'P0001';
  end if;

  select * into v_media from public.media_files
   where id = p_proof_media_id
     and store_id = p_store_id
     and purpose = 'payment_proof'
     and deleted_at is null;
  if not found then
    raise exception 'INVALID_MEDIA: إثبات التحويل غير صالح' using errcode = 'P0001';
  end if;
  if v_media.status <> 'ready' then
    raise exception 'INVALID_MEDIA: لم يكتمل رفع إيصال التحويل' using errcode = 'P0001';
  end if;
  -- الملف موجود فعلًا في التخزين لا مجرد صفّ في الجدول
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = v_media.bucket and o.name = v_media.path
  ) then
    raise exception 'INVALID_MEDIA: لم يصل ملف الإيصال' using errcode = 'P0001';
  end if;
  -- إيصال واحد لعملية واحدة
  if exists (
    select 1 from public.subscription_requests
    where proof_media_id = p_proof_media_id
  ) or exists (
    select 1 from public.payments where proof_media_id = p_proof_media_id
  ) then
    raise exception 'INVALID_MEDIA: هذا الإيصال مرتبط بعملية أخرى' using errcode = 'P0001';
  end if;

  insert into public.subscription_requests
    (store_id, plan_id, amount, discount_amount, net_amount,
     reference, proof_media_id, status, idempotency_key)
  values (p_store_id, p_plan_id, app.money(v_plan.price), 0,
          app.money(v_plan.price), nullif(trim(p_reference), ''),
          p_proof_media_id, 'pending', v_key)
  returning id into v_id;

  return query select v_id, app.money(v_plan.price);
end;
$$;

revoke execute on function public.submit_subscription_request(uuid, uuid, text, uuid, text)
  from public, anon;
grant execute on function public.submit_subscription_request(uuid, uuid, text, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- قراءة إيصال الاشتراك لموظف المنصة.
--
-- ★ المسار لا يأتي من المتصفح: يُقرأ من الطلب بعد فحص الصلاحية، فمن
-- لا يملك subscriptions:view لا يحصل على مسار ولا على رابط.
-- ---------------------------------------------------------------------
create or replace function public.subscription_request_proof(p_request_id uuid)
returns table (
  bucket text, path text, mime_type text, size_bytes bigint, uploaded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_req   public.subscription_requests%rowtype;
  v_media public.media_files%rowtype;
begin
  if not app.has_platform_permission('subscriptions', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_req from public.subscription_requests where id = p_request_id;
  if not found or v_req.proof_media_id is null then
    return;
  end if;

  select * into v_media from public.media_files
   where id = v_req.proof_media_id and purpose = 'payment_proof'
     and deleted_at is null;
  if not found then return; end if;

  return query select v_media.bucket, v_media.path, v_media.mime_type,
                      v_media.size_bytes, v_media.created_at;
end;
$$;

revoke execute on function public.subscription_request_proof(uuid) from public, anon;
grant   execute on function public.subscription_request_proof(uuid) to authenticated;

-- موظف المراجعة يحتاج قراءة الملف نفسه ليوقّع رابطًا له. السياسة
-- القائمة تفتح store-private لمن يملك payments:view؛ هذه تضيف
-- subscriptions:view لمجلد إيصالات الاشتراك **وحده**.
drop policy if exists "sub_proof_platform_read" on storage.objects;
create policy "sub_proof_platform_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'store-private'
    and (storage.foldername(name))[1] = 'stores'
    and (storage.foldername(name))[3] = 'payment-proofs'
    and app.has_platform_permission('subscriptions', 'view')
  );

-- =====================================================================
-- (ب) تحويل طلب متجر
-- =====================================================================

-- ---------------------------------------------------------------------
-- بيانات تحويل المتجر **قبل** إنشاء الطلب.
--
-- 0020 تفتح الحساب لمن أثبت صلته بطلب قائم. لكن الزبون الآن يحوّل
-- قبل إتمام الطلب، فيحتاجها وسلته بين يديه. الشرط هنا: سلة نشطة غير
-- فارغة في هذا المتجر، والمتجر يقبل التحويل. لا أكثر — `bank_accounts`
-- تبقى مغلقة على المتصفّح المارّ.
-- ---------------------------------------------------------------------
create or replace function public.checkout_payment_info(
  p_store_id   uuid,
  p_anon_token text default null
)
returns table (bank_accounts jsonb, bankak_number text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cart     uuid;
  v_settings public.store_settings%rowtype;
begin
  if not app.is_store_public(p_store_id) then return; end if;

  select * into v_settings from public.store_settings where store_id = p_store_id;
  if not found then return; end if;
  if not (v_settings.bank_transfer_enabled or v_settings.bankak_enabled) then
    return;
  end if;

  v_cart := app.resolve_cart(p_store_id, p_anon_token, false);
  if v_cart is null then return; end if;
  if not exists (select 1 from public.cart_items where cart_id = v_cart) then
    return;
  end if;

  return query
  select
    case when v_settings.bank_transfer_enabled
         then coalesce(s.bank_accounts, '[]'::jsonb) else '[]'::jsonb end,
    case when v_settings.bankak_enabled then s.bankak_number else null end
  from public.store_payment_settings s
  where s.store_id = p_store_id;
end;
$$;

revoke execute on function public.checkout_payment_info(uuid, text) from public;
grant   execute on function public.checkout_payment_info(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- تذكرة رفع إيصال طلب — للزبون، بلا عضوية في المتجر.
--
-- ★ `prepare_upload` تشترط صلاحية عضو (settings:view) لأن كل أغراضها
-- أغراض تاجر. زبون المتجر ليس عضوًا فيه ولن يكون، فله باب مستقل
-- بشرط مختلف: سلة نشطة غير فارغة في هذا المتجر.
--
-- ★ الاسم والمسار يُولَّدان هنا — لا يأتي شيء منهما من المتصفح.
--
-- ★ لا تُحتسب على حصة تخزين الباقة: إيصال يرفعه زبون ليس استهلاكًا
-- اختياريًا للتاجر، وربطه بالحصة يعني أن متجرًا بلغ حدّه يتعذّر
-- الشراء منه بالتحويل.
-- ---------------------------------------------------------------------
create or replace function public.prepare_order_proof_upload(
  p_store_id   uuid,
  p_anon_token text,
  p_mime       text,
  p_size       bigint,
  p_ext        text default null
)
returns table (media_id uuid, bucket text, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cart    uuid;
  v_allowed text[];
  v_limit   bigint;
  v_id      uuid := gen_random_uuid();
  v_ext     text := lower(coalesce(nullif(trim(p_ext), ''), 'bin'));
  v_path    text;
  v_recent  integer;
begin
  if not app.is_store_public(p_store_id) then
    raise exception 'STORE_UNAVAILABLE: المتجر غير متاح' using errcode = 'P0002';
  end if;
  if not app.store_can_checkout(p_store_id) then
    raise exception 'CHECKOUT_DISABLED: هذا المتجر غير متاح للشراء حاليًا'
      using errcode = 'P0001';
  end if;

  v_cart := app.resolve_cart(p_store_id, p_anon_token, false);
  if v_cart is null
     or not exists (select 1 from public.cart_items where cart_id = v_cart) then
    raise exception 'EMPTY_CART: السلة فارغة' using errcode = 'P0001';
  end if;

  -- سقف بسيط يمنع استنزاف تخزين التاجر برفع متكرّر من نفس السلة
  select count(*) into v_recent from public.media_files
   where cart_id = v_cart and purpose = 'order_payment_proof'
     and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'RATE_LIMITED: حاولت رفع الإيصال مرات كثيرة — انتظر قليلًا'
      using errcode = 'P0001';
  end if;

  -- النوع والحجم من إعداد الدلو نفسه (مصدر واحد)
  select allowed_mime_types, file_size_limit into v_allowed, v_limit
    from storage.buckets where id = 'store-private';

  if v_allowed is not null and not (p_mime = any(v_allowed)) then
    raise exception 'INVALID_MIME: نوع الملف غير مسموح' using errcode = 'P0001';
  end if;
  if p_size is null or p_size <= 0 then
    raise exception 'INVALID_SIZE' using errcode = 'P0001';
  end if;
  if v_limit is not null and p_size > v_limit then
    raise exception 'FILE_TOO_LARGE: حجم الملف يتجاوز الحد المسموح'
      using errcode = 'P0001';
  end if;

  v_path := 'stores/' || p_store_id::text || '/order-payment-proofs/'
            || v_id::text || '.' || v_ext;

  insert into public.media_files
    (id, bucket, path, owner_profile_id, store_id, cart_id, purpose,
     mime_type, size_bytes, status)
  values (v_id, 'store-private', v_path, (select auth.uid()), p_store_id, v_cart,
          'order_payment_proof', p_mime, p_size, 'pending');

  return query select v_id, 'store-private'::text, v_path;
end;
$$;

revoke execute on function public.prepare_order_proof_upload(uuid, text, text, bigint, text)
  from public;
grant execute on function public.prepare_order_proof_upload(uuid, text, text, bigint, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- قدرة الكتابة لمرة واحدة على مسار أصدرته القاعدة.
--
-- سياسات storage تُقيَّم بدور المنادي، وزبور المتجر `anon` لا يقرأ
-- `media_files` — فتُقرأ هنا بـsecurity definer. المسار UUID عشوائي
-- لا يُخمَّن، ويتوقّف قبوله فور اكتمال الرفع (status ≠ pending)،
-- فهي قدرة لمرة واحدة لا فتحٌ للدلو.
-- ---------------------------------------------------------------------
create or replace function app.is_open_order_proof_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_files m
    where m.path = p_path
      and m.bucket = 'store-private'
      and m.purpose = 'order_payment_proof'
      and m.status = 'pending'
      and m.deleted_at is null
  );
$$;

revoke execute on function app.is_open_order_proof_path(text) from public;
grant   execute on function app.is_open_order_proof_path(text) to anon, authenticated;

drop policy if exists "order_proof_insert" on storage.objects;
create policy "order_proof_insert" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'store-private'
    and (storage.foldername(name))[1] = 'stores'
    and (storage.foldername(name))[3] = 'order-payment-proofs'
    and app.is_open_order_proof_path(name)
  );

-- لا UPDATE ولا DELETE للزبون: الإيصال سجل مالي (D32).

-- التاجر يراجع بصلاحية orders:payment. السياسة القائمة تفتح الدلو
-- لمن يملك settings:view، وقد لا يملكها موظف مبيعات مخوّل بالدفعات.
drop policy if exists "order_proof_store_read" on storage.objects;
create policy "order_proof_store_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'store-private'
    and (storage.foldername(name))[1] = 'stores'
    and (storage.foldername(name))[3] = 'order-payment-proofs'
    and app.has_store_permission(((storage.foldername(name))[2])::uuid, 'orders:payment')
  );

-- ---------------------------------------------------------------------
-- إتمام طلب بتحويل بنكي: الطلب والدفعة المعلّقة في معاملة واحدة.
--
-- ★ لا يُعاد بناء `create_order` — تُستدعى كما هي، فكل حساب السعر
-- والمخزون والكوبون يبقى في موضع واحد. هذه الدالة تضيف قبله شرط
-- الإيصال، وبعده قيدَ الدفعة، وكلاهما داخل نفس المعاملة: إن فشل
-- ربط الإيصال لم يوجد الطلب أصلًا.
--
-- ★ الدفعة تُقيَّد `pending` لا `paid`: رفع الإيصال ليس تأكيدًا.
-- المشغّل `refresh_order_payment_totals` يترجم ذلك إلى
-- payment_status='pending' على الطلب — أي «بانتظار تحقق التاجر».
--
-- ★ المبلغ هو `total` العائد من `create_order` — لا رقم من المتصفح.
-- ---------------------------------------------------------------------
create or replace function public.create_order_with_proof(
  p_store_id        uuid,
  p_items           jsonb,
  p_zone_id         uuid,
  p_contact         jsonb,
  p_address         jsonb,
  p_payment_method  public.payment_method,
  p_proof_media_id  uuid,
  p_coupon_code     text default null,
  p_idempotency_key text default null,
  p_note            text default null,
  p_reference       text default null,
  p_anon_token      text default null
)
returns table (order_id uuid, order_number text, total numeric, guest_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key      text := coalesce(nullif(trim(p_idempotency_key), ''), app.random_token(16));
  v_pay_key  text;
  v_media    public.media_files%rowtype;
  v_cart     uuid;
  v_order_id uuid;
  v_number   text;
  v_total    numeric(14,2);
  v_guest    text;
  v_payment_id uuid;
begin
  if p_payment_method not in ('bank_transfer', 'bankak') then
    raise exception 'VALIDATION: هذا المسار للتحويل البنكي فقط' using errcode = 'P0001';
  end if;
  if p_proof_media_id is null then
    raise exception 'PROOF_REQUIRED: إرفاق إيصال التحويل مطلوب لإتمام الطلب'
      using errcode = 'P0001';
  end if;

  v_pay_key := v_key || ':proof';

  -- إعادة إرسال بنفس المفتاح ⇒ نفس الطلب ونفس الدفعة
  if exists (select 1 from public.payments
              where kind = 'order' and idempotency_key = v_pay_key) then
    select o.id, o.order_number, o.total, o.guest_token
      into v_order_id, v_number, v_total, v_guest
      from public.orders o
      where o.store_id = p_store_id and o.idempotency_key = v_key;
    if found then
      return query select v_order_id, v_number, v_total, v_guest;
      return;
    end if;
  end if;

  -- السلة هي هوية الزبون قبل الطلب
  v_cart := app.resolve_cart(p_store_id, p_anon_token, false);
  if v_cart is null then
    raise exception 'EMPTY_CART: السلة فارغة' using errcode = 'P0001';
  end if;

  select * into v_media from public.media_files
   where id = p_proof_media_id and deleted_at is null
   for update;
  if not found
     or v_media.purpose <> 'order_payment_proof'
     or v_media.store_id is distinct from p_store_id
     or v_media.cart_id is distinct from v_cart then
    -- متجر آخر · سلة أخرى · غرض آخر ⇒ نفس الرسالة: لا نكشف أيّها
    raise exception 'INVALID_MEDIA: إيصال التحويل غير صالح' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payments where proof_media_id = v_media.id) then
    raise exception 'INVALID_MEDIA: هذا الإيصال مرتبط بطلب آخر' using errcode = 'P0001';
  end if;
  -- الملف وصل التخزين فعلًا — لا صفّ معلّق بلا ملف
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = v_media.bucket and o.name = v_media.path
  ) then
    raise exception 'INVALID_MEDIA: لم يكتمل رفع الإيصال' using errcode = 'P0001';
  end if;

  select c.order_id, c.order_number, c.total, c.guest_token
    into v_order_id, v_number, v_total, v_guest
    from public.create_order(
      p_store_id, p_items, p_zone_id, p_contact, p_address, p_payment_method,
      p_coupon_code, v_key, p_note, v_cart
    ) c;

  if exists (select 1 from public.payments p
              where p.order_id = v_order_id and p.proof_media_id is not null) then
    -- طلب سابق بنفس المفتاح اكتمل قبلًا
    return query select v_order_id, v_number, v_total, v_guest;
    return;
  end if;

  update public.media_files set status = 'ready' where id = v_media.id;

  insert into public.payments
    (kind, store_id, order_id, method, status, amount, reference,
     proof_media_id, idempotency_key)
  values ('order', p_store_id, v_order_id, p_payment_method, 'pending',
          v_total, nullif(trim(p_reference), ''), v_media.id, v_pay_key)
  returning id into v_payment_id;

  -- سجل المراجعة يبدأ من لحظة الرفع لا من لحظة القرار
  insert into public.payment_events
    (payment_id, event, from_status, to_status, actor_id)
  values (v_payment_id, 'customer_submitted_transfer', null, 'pending',
          (select auth.uid()));

  return query select v_order_id, v_number, v_total, v_guest;
end;
$$;

revoke execute on function public.create_order_with_proof(
  uuid, jsonb, uuid, jsonb, jsonb, public.payment_method, uuid,
  text, text, text, text, text) from public;
grant execute on function public.create_order_with_proof(
  uuid, jsonb, uuid, jsonb, jsonb, public.payment_method, uuid,
  text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- الحاجز الأخير: طلب تحويل بلا إيصال لا يُكتب — أيًّا كان المنادي.
--
-- قيد مؤجَّل إلى نهاية المعاملة لأن الدفعة تُقيَّد بعد الطلب: الفحص
-- عند الإدراج كان سيرفض كل طلب. المسار المباشر `create_order` يبقى
-- كما هو للدفع عند الاستلام، ويصير التحويل مستحيلًا من دونه — فلا
-- يكفي تجاوز الواجهة للالتفاف على الشرط.
-- ---------------------------------------------------------------------
create or replace function app.assert_transfer_order_has_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_method in ('bank_transfer', 'bankak')
     and not exists (
       select 1 from public.payments p
       where p.order_id = new.id and p.proof_media_id is not null
     ) then
    raise exception 'PROOF_REQUIRED: إرفاق إيصال التحويل مطلوب لإتمام الطلب'
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists orders_transfer_proof on public.orders;
create constraint trigger orders_transfer_proof
  after insert on public.orders
  deferrable initially deferred
  for each row execute function app.assert_transfer_order_has_proof();

-- ---------------------------------------------------------------------
-- قراءة إيصال الطلب لعضو المتجر المخوّل.
-- المسار يُقرأ بعد فحص الصلاحية، ثم يوقّعه التطبيق لدقيقتين.
-- ---------------------------------------------------------------------
create or replace function public.order_payment_proofs(p_order_id uuid)
returns table (
  payment_id uuid, payment_status public.payment_status, amount numeric,
  reference text, failed_reason text, submitted_at timestamptz,
  confirmed_at timestamptz, confirmed_by_name text,
  bucket text, path text, mime_type text, size_bytes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_store uuid;
begin
  select store_id into v_store from public.orders where id = p_order_id;
  if v_store is null then return; end if;
  if not app.has_store_permission(v_store, 'orders:payment') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select p.id, p.status, p.amount, p.reference, p.failed_reason, p.created_at,
         p.confirmed_at, pr.full_name, m.bucket, m.path, m.mime_type, m.size_bytes
    from public.payments p
    join public.media_files m on m.id = p.proof_media_id
    left join public.profiles pr on pr.id = p.confirmed_by
   where p.order_id = p_order_id
     and p.kind = 'order'
     and m.purpose = 'order_payment_proof'
     and m.deleted_at is null
   order by p.created_at;
end;
$$;

revoke execute on function public.order_payment_proofs(uuid) from public, anon;
grant   execute on function public.order_payment_proofs(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- قرار التاجر في تحويل الزبون.
--
-- ★ هذا هو الفعل الذي يؤكّد الدفع — لا الرفع. قبله الدفعة `pending`
-- والطلب «بانتظار التحقق»؛ بعده `paid` أو `failed`، ويعيد المشغّل
-- حساب حالة الطلب من الدفعات لا من الواجهة.
--
-- ★ الرفض يعيد الطلب إلى «غير مدفوع» بمنطق العمل القائم نفسه: لا
-- يُلغى الطلب ولا يُحذف الإيصال — سجل المراجعة يبقى كاملًا.
-- ---------------------------------------------------------------------
create or replace function public.review_order_payment(
  p_payment_id uuid,
  p_action     text,
  p_reason     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay   public.payments%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found or v_pay.kind <> 'order' then
    raise exception 'NOT_FOUND: الدفعة غير موجودة' using errcode = 'P0002';
  end if;
  if v_pay.store_id is null
     or not app.has_store_permission(v_pay.store_id, 'orders:payment') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_pay.status <> 'pending' then
    raise exception 'VALIDATION: تمت مراجعة هذه الدفعة من قبل' using errcode = 'P0001';
  end if;
  if v_pay.proof_media_id is null then
    raise exception 'VALIDATION: لا إيصال مرفق بهذه الدفعة' using errcode = 'P0001';
  end if;

  if p_action = 'approve' then
    update public.payments
       set status = 'paid', paid_at = now(),
           confirmed_by = (select auth.uid()), confirmed_at = now()
     where id = p_payment_id;

    insert into public.payment_events
      (payment_id, event, from_status, to_status, actor_id)
    values (p_payment_id, 'store_confirmed_transfer', 'pending', 'paid',
            (select auth.uid()));

    -- ★ «تأكيد الدفع والانتقال بالطلب للمرحلة التالية»: طلب جديد
    -- وصل تحويله صار طلبًا مؤكَّدًا. يمرّ بـ`transition_order` نفسها
    -- فتُطبَّق آلة الحالة ويُكتب سجلّها — ولا يُفرض على من لا يملك
    -- صلاحية التحديث: الدفعة تبقى مؤكَّدة وتُترك الحالة لصاحبها.
    select * into v_order from public.orders where id = v_pay.order_id;
    if found and v_order.status = 'new'
       and app.has_store_permission(
             v_pay.store_id,
             app.order_transition_permission('new', 'confirmed')) then
      perform public.transition_order(v_pay.order_id, 'confirmed',
                                      'تأكيد وصول التحويل البنكي');
    end if;

  elsif p_action = 'reject' then
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'VALIDATION: اذكر سبب الرفض' using errcode = 'P0001';
    end if;

    update public.payments
       set status = 'failed', failed_reason = trim(p_reason)
     where id = p_payment_id;

    insert into public.payment_events
      (payment_id, event, from_status, to_status, actor_id, metadata)
    values (p_payment_id, 'store_rejected_transfer', 'pending', 'failed',
            (select auth.uid()), jsonb_build_object('reason', trim(p_reason)));

  else
    raise exception 'VALIDATION: إجراء غير معروف' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.review_order_payment(uuid, text, text)
  from public, anon;
grant   execute on function public.review_order_payment(uuid, text, text)
  to authenticated;
