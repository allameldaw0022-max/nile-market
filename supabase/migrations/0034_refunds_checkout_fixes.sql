-- =====================================================================
-- 0034 الاستردادات + إصلاحات الدفع والكوبونات (إضافية · لا تمسّ ما سبق)
--
-- ثلاثة أخطاء حقيقية وُجدت في تدقيق ما قبل الإطلاق:
--
--   1) الاسترداد كان **جدولًا ميتًا**: `refunds` وقيود فصل المهام
--      وحارس المبلغ و`app.reverse_commission` كلها موجودة منذ 0009،
--      لكن لا دالة تناديها ولا واجهة. الاسترداد غير ممكن إطلاقًا.
--   2) `create_order` كان يفحص تفعيل الدفع عند الاستلام وحده، فتاجر
--      أطفأ التحويل البنكي يستقبل طلبات تحويل بلا وجهة.
--   3) `create_order` كان يمرّر null لمعرّف العميل إلى `validate_coupon`
--      فيتخطّى حدّ «مرّة لكل عميل» بصمت، ويقرأ الحدّ الكلي بلا قفل
--      فيتجاوزه طلبان متزامنان.
--
-- (2) و(3) مُصلحان في `create_order` أدناه؛ وهذا الملف يضيف مسار
-- الاسترداد كاملًا.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ★ الاسترداد يحدّث إجماليات الطلب.
--
-- `app.refresh_order_payment_totals` كانت معلّقة على `payments` وحدها،
-- فاسترداد مكتمل كان يترك `refunded_total = 0` و`payment_status = paid`
-- — أي طلبٌ استُرد ثمنه يظهر مدفوعًا.
-- ---------------------------------------------------------------------
drop trigger if exists refunds_refresh_order on public.refunds;
create trigger refunds_refresh_order
  after insert or update on public.refunds
  for each row execute function app.refresh_order_payment_totals();

-- =====================================================================
-- ١) طلب استرداد
--
-- يبادر به التاجر (على دفعة طلب في متجره) أو موظف منصة. المبادِر
-- يُسجَّل في `initiated_by`، والقيود في الجدول ترفض لاحقًا أن يكون هو
-- المعتمِد (D30) — ويسري ذلك على service_role أيضًا.
-- =====================================================================
create or replace function public.request_refund(
  p_payment_id      uuid,
  p_amount          numeric,
  p_reason          text,
  p_idempotency_key text default null
)
returns table (refund_id uuid, amount numeric, status public.refund_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_key      text := coalesce(nullif(trim(p_idempotency_key), ''), app.random_token(16));
  v_existing public.refunds%rowtype;
  v_payment  public.payments%rowtype;
  v_actor    uuid := (select auth.uid());
  v_kind     public.actor_kind;
  v_refunded numeric(14,2);
  v_id       uuid;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  -- تكرار النداء بنفس المفتاح يعيد الطلب نفسه لا طلبًا ثانيًا
  select * into v_existing from public.refunds where idempotency_key = v_key;
  if found then
    return query select v_existing.id, v_existing.amount, v_existing.status;
    return;
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'NOT_FOUND: الدفعة غير موجودة' using errcode = 'P0002';
  end if;
  if v_payment.status <> 'paid' then
    raise exception 'VALIDATION: لا يُسترد إلا من دفعة مؤكَّدة' using errcode = 'P0001';
  end if;

  -- الصلاحية: موظف منصة بصلاحية الاسترداد، أو فريق المتجر على دفعة
  -- طلب من متجره. دفعة الاشتراك لا يستردّها التاجر — هي مال المنصة.
  if app.has_platform_permission('payments', 'approve') then
    v_kind := 'platform';
  elsif v_payment.kind = 'order'
        and v_payment.store_id is not null
        and app.has_store_permission(v_payment.store_id, 'orders:payment') then
    v_kind := 'store';
  else
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'VALIDATION: مبلغ الاسترداد يجب أن يكون أكبر من صفر'
      using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'REASON_REQUIRED: سبب الاسترداد إلزامي' using errcode = 'P0001';
  end if;

  -- الحدّ من الجدول أيضًا (`app.guard_refund_amount`)، والفحص هنا
  -- لرسالة واضحة قبل أن يرتطم المستخدم بالحارس
  select coalesce(sum(amount), 0) into v_refunded
    from public.refunds
   where payment_id = p_payment_id and status in ('approved', 'completed');
  if v_refunded + app.money(p_amount) > v_payment.amount then
    raise exception 'REFUND_EXCEEDS_PAYMENT: المتبقي للاسترداد % فقط',
      (v_payment.amount - v_refunded) using errcode = 'P0001';
  end if;

  insert into public.refunds
    (payment_id, store_id, order_id, subscription_id, amount, reason, status,
     initiated_by, initiated_by_kind, idempotency_key)
  values (p_payment_id, v_payment.store_id, v_payment.order_id,
          v_payment.subscription_id, app.money(p_amount), trim(p_reason),
          'submitted', v_actor, v_kind, v_key)
  returning id into v_id;

  return query select v_id, app.money(p_amount), 'submitted'::public.refund_status;
end;
$$;

revoke execute on function public.request_refund(uuid, numeric, text, text)
  from public, anon;
grant execute on function public.request_refund(uuid, numeric, text, text)
  to authenticated;

-- =====================================================================
-- ٢) مراجعة الاسترداد — ثلاث خطوات بثلاثة أشخاص (D30)
--
--   record  : موظف يسجّل الطلب إداريًا  (`requested_by`)
--   approve : موظف **آخر** يعتمده       (`approved_by`)
--   reject  : رفض بسبب إلزامي
--
-- ★ الفحوص هنا لرسائل واضحة؛ الحاجز الفعلي قيدا CHECK في الجدول
-- (`refunds_sod_requester` و`refunds_sod_initiator`) اللذان يسريان على
-- service_role أيضًا.
-- =====================================================================
create or replace function public.review_refund(
  p_refund_id uuid,
  p_action    text,
  p_reason    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r       public.refunds%rowtype;
  v_actor uuid := (select auth.uid());
begin
  if p_action not in ('record', 'approve', 'reject') then
    raise exception 'VALIDATION: إجراء غير معروف' using errcode = 'P0001';
  end if;

  select * into r from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'NOT_FOUND: طلب الاسترداد غير موجود' using errcode = 'P0002';
  end if;
  if r.status in ('completed', 'rejected') then
    raise exception 'VALIDATION: الطلب أُغلق مسبقًا' using errcode = 'P0001';
  end if;

  if p_action = 'record' then
    if not app.has_platform_permission('payments', 'edit') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if r.requested_by is not null then
      raise exception 'VALIDATION: الطلب مسجَّل مسبقًا' using errcode = 'P0001';
    end if;
    if r.initiated_by = v_actor then
      raise exception 'SOD_SAME_ACTOR: لا يسجّل الطلبَ إداريًا مَن بادر به'
        using errcode = '42501';
    end if;

    update public.refunds
       set requested_by = v_actor, status = 'pending_review'
     where id = p_refund_id;
    return jsonb_build_object('status', 'pending_review');
  end if;

  if not app.has_platform_permission('payments', 'approve') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_action = 'reject' then
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'REASON_REQUIRED: سبب الرفض إلزامي' using errcode = 'P0001';
    end if;
    update public.refunds
       set status = 'rejected', rejected_reason = trim(p_reason)
     where id = p_refund_id;
    return jsonb_build_object('status', 'rejected');
  end if;

  -- approve
  if r.requested_by is null then
    raise exception 'SOD_ORDER: لا اعتماد قبل تسجيل الطلب إداريًا'
      using errcode = 'P0001';
  end if;
  if r.requested_by = v_actor then
    raise exception 'SOD_SAME_ACTOR: لا يعتمد مَن سجّل الطلب' using errcode = '42501';
  end if;
  if r.initiated_by = v_actor then
    raise exception 'SOD_SAME_ACTOR: لا يعتمد مَن بادر بالطلب' using errcode = '42501';
  end if;

  update public.refunds
     set status = 'approved', approved_by = v_actor, approved_at = now()
   where id = p_refund_id;

  return jsonb_build_object('status', 'approved');
end;
$$;

revoke execute on function public.review_refund(uuid, text, text) from public, anon;
grant   execute on function public.review_refund(uuid, text, text) to authenticated;

-- =====================================================================
-- ٣) إتمام الاسترداد — القيد المالي
--
-- ★ كل شيء في معاملة واحدة: حالة الاسترداد، قيد الدفتر، وعكس عمولة
-- الشريك بالتناسب. استرداد يُقيَّد بلا عكس عمولة يترك المنصة تدفع
-- عمولة على مال أعادته.
--
-- ★ المبلغ لا يُمرَّر هنا: يُقرأ من الصفّ المعتمَد. تمريره كان سيسمح
-- باعتماد مبلغ وصرف غيره.
-- =====================================================================
create or replace function public.complete_refund(
  p_refund_id uuid,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r          public.refunds%rowtype;
  v_payment  public.payments%rowtype;
  v_reversal uuid;
  v_store    public.stores%rowtype;
begin
  if not app.has_platform_permission('payments', 'approve') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into r from public.refunds where id = p_refund_id for update;
  if not found then
    raise exception 'NOT_FOUND: طلب الاسترداد غير موجود' using errcode = 'P0002';
  end if;
  if r.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'already', true);
  end if;
  if r.status <> 'approved' then
    raise exception 'VALIDATION: لا يُصرف إلا استرداد معتمَد' using errcode = 'P0001';
  end if;

  select * into v_payment from public.payments where id = r.payment_id;

  update public.refunds
     set status = 'completed', completed_at = now()
   where id = p_refund_id;

  -- قيد الدفتر: خروج من حساب المنصة لاشتراك، ومن حساب المتجر لطلب
  insert into public.ledger_entries
    (account_kind, account_id, entry_type, direction, amount, refund_id,
     payment_id, subscription_id, memo, created_by)
  values ((case when v_payment.kind = 'subscription' then 'platform'
                else 'store' end)::public.ledger_account,
          case when v_payment.kind = 'subscription' then null else r.store_id end,
          'refund', 'debit', r.amount, p_refund_id, r.payment_id,
          r.subscription_id,
          coalesce(nullif(trim(p_reference), ''), 'استرداد'),
          (select auth.uid()));

  -- عكس عمولة الشريك بالتناسب (لا شيء إن لم تكن هناك عمولة)
  v_reversal := app.reverse_commission(p_refund_id);

  if r.store_id is not null then
    select * into v_store from public.stores where id = r.store_id;
    if found then
      perform app.notify(v_store.owner_id, 'refund.completed',
        'تم تنفيذ استرداد بمبلغ ' || r.amount::text,
        nullif(trim(r.reason), ''),
        case when r.order_id is not null then '/dashboard/orders/' || r.order_id::text
             else '/dashboard/subscription' end,
        r.store_id, 'refund.completed:' || r.id::text);
    end if;
  end if;

  return jsonb_build_object('status', 'completed',
                            'commission_reversal', v_reversal);
end;
$$;

revoke execute on function public.complete_refund(uuid, text) from public, anon;
grant   execute on function public.complete_refund(uuid, text) to authenticated;

-- =====================================================================
-- ٤) قائمة الاستردادات للإدارة
-- =====================================================================
create or replace function public.refunds_page(
  p_status text default null,
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  refund_id    uuid,
  payment_id   uuid,
  store_id     uuid,
  store_name   text,
  order_number text,
  kind         text,
  amount       numeric,
  reason       text,
  status       text,
  initiated_by uuid,
  requested_by uuid,
  approved_by  uuid,
  created_at   timestamptz,
  total_count  bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  if not app.has_platform_permission('payments', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select rf.*, s.name as store_name, o.order_number, pay.kind as payment_kind
      from public.refunds rf
      left join public.stores s   on s.id   = rf.store_id
      left join public.orders o   on o.id   = rf.order_id
      left join public.payments pay on pay.id = rf.payment_id
     where (p_status is null or rf.status::text = p_status)
  )
  select f.id, f.payment_id, f.store_id, f.store_name, f.order_number,
         f.payment_kind::text, f.amount, f.reason, f.status::text,
         f.initiated_by, f.requested_by, f.approved_by, f.created_at,
         count(*) over ()
    from filtered f
   order by f.created_at desc
   limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.refunds_page(text, integer, integer)
  from public, anon;
grant execute on function public.refunds_page(text, integer, integer)
  to authenticated;
create or replace function public.create_order(
  p_store_id        uuid,
  p_items           jsonb,        -- [{product_id, variant_id, quantity}]
  p_zone_id         uuid,
  p_contact         jsonb,        -- {name, phone, email}
  p_address         jsonb,
  p_payment_method  public.payment_method,
  p_coupon_code     text default null,
  p_idempotency_key text default null,
  p_note            text default null,
  p_cart_id         uuid default null
)
returns table (order_id uuid, order_number text, total numeric, guest_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key        text := coalesce(nullif(trim(p_idempotency_key), ''), app.random_token(16));
  v_existing   public.orders%rowtype;
  v_store      public.stores%rowtype;
  v_zone       public.delivery_zones%rowtype;
  v_item       jsonb;
  v_product    public.products%rowtype;
  v_variant    public.product_variants%rowtype;
  v_qty        integer;
  v_price      numeric(14,2);
  v_subtotal   numeric(14,2) := 0;
  v_delivery   numeric(14,2) := 0;
  v_discount   numeric(14,2) := 0;
  v_coupon_id  uuid;
  v_coupon     record;
  v_total      numeric(14,2);
  v_order_id   uuid;
  v_number     text;
  v_customer_id uuid;
  v_guest      text := app.random_token(16);
  v_available  integer;
  v_settings   public.store_settings%rowtype;
  v_limit_total integer;
begin
  -- 1) Idempotency: نفس المفتاح ⇒ نفس الطلب، لا طلب ثانٍ (§13)
  select * into v_existing from public.orders
   where store_id = p_store_id and idempotency_key = v_key;
  if found then
    return query select v_existing.id, v_existing.order_number,
                        v_existing.total, v_existing.guest_token;
    return;
  end if;

  -- 2) المتجر: موجود ونشط
  select * into v_store from public.stores
   where id = p_store_id and status = 'active' and deleted_at is null;
  if not found then
    raise exception 'STORE_UNAVAILABLE: المتجر غير متاح' using errcode = 'P0002';
  end if;

  -- 3) D14: الاشتراك يجب أن يسمح بالشراء
  if not app.store_can_checkout(p_store_id) then
    raise exception 'CHECKOUT_DISABLED: هذا المتجر غير متاح للشراء حاليًا'
      using errcode = 'P0001';
  end if;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'EMPTY_CART: السلة فارغة' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_contact ->> 'name'), '') = ''
     or coalesce(trim(p_contact ->> 'phone'), '') = '' then
    raise exception 'CONTACT_REQUIRED: الاسم ورقم الهاتف مطلوبان' using errcode = 'P0001';
  end if;

  -- 4) طريقة الدفع مفعّلة في هذا المتجر
  --
  -- ★ الطرق الثلاث تُفحص، لا الدفع عند الاستلام وحده: تاجر أطفأ
  -- التحويل البنكي لأنه لا يملك حسابًا كان يستقبل طلبات «تحويل بنكي»
  -- بلا وجهة تحويل، لأن الفحص كان مقصورًا على COD.
  select * into v_settings from public.store_settings where store_id = p_store_id;
  if not found then
    raise exception 'STORE_UNAVAILABLE: إعدادات المتجر غير مكتملة' using errcode = 'P0002';
  end if;
  if not (case p_payment_method
            when 'cash_on_delivery' then v_settings.cod_enabled
            when 'bank_transfer'    then v_settings.bank_transfer_enabled
            when 'bankak'           then v_settings.bankak_enabled
            else false
          end) then
    raise exception 'PAYMENT_METHOD_DISABLED: طريقة الدفع المختارة غير مفعّلة في هذا المتجر'
      using errcode = 'P0001';
  end if;

  -- 5) رسوم التوصيل — من القاعدة لا من المتصفح (★ إصلاح S2)
  if p_zone_id is not null then
    select * into v_zone from public.delivery_zones
     where id = p_zone_id and store_id = p_store_id and is_active and deleted_at is null;
    if not found then
      raise exception 'INVALID_ZONE: منطقة التوصيل غير صالحة' using errcode = 'P0001';
    end if;
    v_delivery := v_zone.fee;
  end if;

  v_order_id := gen_random_uuid();
  v_number   := app.next_order_number(p_store_id);

  -- سجل العميل داخل هذا المتجر (D22) — قبل إنشاء الطلب ليُربط به
  if (select auth.uid()) is not null then
    insert into public.customers (store_id, profile_id, name, phone, email)
    values (p_store_id, (select auth.uid()), p_contact ->> 'name',
            p_contact ->> 'phone', p_contact ->> 'email')
    on conflict (store_id, profile_id) where profile_id is not null and deleted_at is null
    do update set name  = coalesce(public.customers.name,  excluded.name),
                  phone = coalesce(public.customers.phone, excluded.phone),
                  updated_at = now()
    returning id into v_customer_id;
  end if;

  -- صف الطلب أولًا بمبالغ صفرية؛ تُحسب وتُحدَّث بعد قراءة كل سطر من
  -- القاعدة. FK على order_items يفرض هذا الترتيب.
  insert into public.orders
    (id, store_id, order_number, customer_id, contact_name, contact_phone, contact_email,
     delivery_zone_id, delivery_zone_name, delivery_address, payment_method,
     subtotal, delivery_fee, discount_total, total, note, idempotency_key, guest_token)
  values
    (v_order_id, p_store_id, v_number, v_customer_id,
     p_contact ->> 'name', p_contact ->> 'phone', p_contact ->> 'email',
     v_zone.id, v_zone.name, coalesce(p_address, '{}'::jsonb), p_payment_method,
     0, 0, 0, 0, p_note, v_key, v_guest);

  -- 6) السطور — السعر يُقرأ من القاعدة لكل سطر
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(coalesce((v_item ->> 'quantity')::integer, 0), 0);
    if v_qty = 0 then
      raise exception 'INVALID_QUANTITY: كمية غير صالحة' using errcode = 'P0001';
    end if;

    select * into v_product from public.products
     where id = (v_item ->> 'product_id')::uuid
       and store_id = p_store_id and status = 'active' and deleted_at is null
     for update;
    if not found then
      raise exception 'PRODUCT_UNAVAILABLE: منتج غير متاح' using errcode = 'P0002';
    end if;

    v_price := v_product.price;
    v_variant := null;
    if (v_item ->> 'variant_id') is not null then
      select * into v_variant from public.product_variants
       where id = (v_item ->> 'variant_id')::uuid
         and product_id = v_product.id and is_active and deleted_at is null;
      if not found then
        raise exception 'VARIANT_UNAVAILABLE: خيار المنتج غير متاح' using errcode = 'P0002';
      end if;
      v_price := coalesce(v_variant.price, v_product.price);
    end if;

    -- المخزون: المتاح = الكمية − المحجوز
    if v_product.track_inventory then
      select (quantity - reserved) into v_available from public.inventory
       where product_id = v_product.id
         and coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(v_variant.id, '00000000-0000-0000-0000-000000000000'::uuid)
       for update;
      if coalesce(v_available, 0) < v_qty then
        raise exception 'OUT_OF_STOCK: الكمية المطلوبة من «%» غير متوفرة', v_product.name
          using errcode = 'P0001';
      end if;
      update public.inventory set reserved = reserved + v_qty, updated_at = now()
       where product_id = v_product.id
         and coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(v_variant.id, '00000000-0000-0000-0000-000000000000'::uuid);
    end if;

    v_subtotal := v_subtotal + app.money(v_price * v_qty);

    insert into public.order_items
      (order_id, store_id, product_id, variant_id, product_name, variant_name,
       sku, unit_price, quantity, line_total)
    values (v_order_id, p_store_id, v_product.id, v_variant.id, v_product.name,
            v_variant.name, coalesce(v_variant.sku, v_product.sku),
            v_price, v_qty, app.money(v_price * v_qty));
  end loop;

  -- 7) شحن مجاني فوق الحد
  if v_zone.id is not null and v_zone.min_order_free is not null
     and v_subtotal >= v_zone.min_order_free then
    v_delivery := 0;
  end if;

  -- 8) الكوبون — يُحسب في القاعدة
  --
  -- ★ معرّف العميل يُمرَّر فعلًا: كان يُمرَّر null فيتخطّى
  -- `validate_coupon` حدَّ «مرّة واحدة لكل عميل» بصمت، فيُعاد استخدام
  -- الكوبون بلا حدّ.
  --
  -- ★ صفّ الكوبون يُقفَل قبل الفحص: طلبان متزامنان كانا يقرآن العدّاد
  -- نفسه فيتجاوزان الحدّ الكلي معًا. القفل يسلسلهما، وإعادة الفحص
  -- تحت القفل هي الحاجز الفعلي لا الفحص الأول.
  if coalesce(trim(p_coupon_code), '') <> '' then
    select id into v_coupon_id from public.coupons
     where store_id = p_store_id and lower(code) = lower(trim(p_coupon_code))
       and deleted_at is null
     for update;

    select * into v_coupon
      from public.validate_coupon(p_store_id, p_coupon_code, v_subtotal, v_customer_id);

    if v_coupon.valid then
      select usage_limit_total into v_limit_total
        from public.coupons where id = v_coupon.coupon_id;
      if v_limit_total is not null
         and (select count(*) from public.coupon_redemptions
               where coupon_id = v_coupon.coupon_id) >= v_limit_total then
        raise exception 'COUPON_EXHAUSTED: بلغ كود الخصم حد الاستخدام'
          using errcode = 'P0001';
      end if;
      v_discount  := v_coupon.discount;
      v_coupon_id := v_coupon.coupon_id;
    else
      v_coupon_id := null;
    end if;
  end if;

  v_total := app.money(greatest(v_subtotal + v_delivery - v_discount, 0));

  -- 9) تثبيت المبالغ المحسوبة خادميًا
  perform set_config('app.financial_write', 'on', true);
  update public.orders
     set subtotal       = app.money(v_subtotal),
         delivery_fee   = app.money(v_delivery),
         discount_total = app.money(v_discount),
         total          = v_total,
         coupon_id      = v_coupon_id,
         coupon_code    = nullif(trim(p_coupon_code), '')
   where id = v_order_id;
  perform set_config('app.financial_write', 'off', true);

  if v_coupon_id is not null then
    insert into public.coupon_redemptions
      (coupon_id, store_id, order_id, customer_id, discount_amount)
    values (v_coupon_id, p_store_id, v_order_id, v_customer_id, v_discount);
    update public.coupons set used_count = used_count + 1 where id = v_coupon_id;
  end if;

  insert into public.order_status_history
    (order_id, store_id, from_status, to_status, actor_id, actor_kind)
  values (v_order_id, p_store_id, null, 'new', (select auth.uid()), 'customer');

  -- 10) تحويل السلة
  if p_cart_id is not null then
    update public.carts set status = 'converted' where id = p_cart_id and store_id = p_store_id;
  end if;

  -- 11) تحديث إحصاءات العميل
  if v_customer_id is not null then
    update public.customers
       set orders_count   = orders_count + 1,
           total_spent    = total_spent + v_total,
           first_order_at = coalesce(first_order_at, now()),
           last_order_at  = now()
     where id = v_customer_id;
  end if;

  return query select v_order_id, v_number, v_total, v_guest;
end;
$$;

-- =====================================================================
-- ٥) إصلاح: `validate_coupon` كانت تفشل في فرع «مرّة لكل عميل»
--
-- ★ `coupon_id` اسم عمود خرج **و** اسم عمود في `coupon_redemptions`،
-- فالاستعلام يفشل بـ«column reference is ambiguous». الفرع لم يكن
-- يُنفَّذ إطلاقًا لأن `create_order` كان يمرّر null لمعرّف العميل،
-- فبقي الخطأ كامنًا حتى صُحِّح الاستدعاء أعلاه. التأهيل باسم الجدول
-- هو الإصلاح.
-- =====================================================================
create or replace function public.validate_coupon(
  p_store_id uuid,
  p_code     text,
  p_subtotal numeric,
  p_customer_id uuid default null
)
returns table (valid boolean, discount numeric, message text, coupon_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.coupons%rowtype;
  v_used_by_customer integer;
  v_discount numeric(14,2);
begin
  select * into c from public.coupons
   where store_id = p_store_id and lower(code) = lower(trim(p_code))
     and deleted_at is null;

  if not found or not c.is_active then
    return query select false, 0::numeric, 'كود الخصم غير صالح'::text, null::uuid; return;
  end if;
  if c.starts_at is not null and now() < c.starts_at then
    return query select false, 0::numeric, 'كود الخصم لم يبدأ بعد'::text, null::uuid; return;
  end if;
  if c.ends_at is not null and now() > c.ends_at then
    return query select false, 0::numeric, 'انتهت صلاحية كود الخصم'::text, null::uuid; return;
  end if;
  if c.usage_limit_total is not null then
    if (select count(*) from public.coupon_redemptions cr where cr.coupon_id = c.id)
       >= c.usage_limit_total then
      return query select false, 0::numeric, 'بلغ كود الخصم حد الاستخدام'::text, null::uuid; return;
    end if;
  end if;
  if c.usage_limit_per_customer is not null and p_customer_id is not null then
    -- ★ الأعمدة مؤهَّلة باسم الجدول: `coupon_id` اسم عمود خرج أيضًا،
    -- وبدون التأهيل يفشل الاستعلام بـ«ambiguous». هذا الفرع لم يكن
    -- يُنفَّذ أصلًا لأن `create_order` كان يمرّر null، فبقي الخطأ كامنًا.
    select count(*) into v_used_by_customer
      from public.coupon_redemptions cr
     where cr.coupon_id = c.id and cr.customer_id = p_customer_id;
    if v_used_by_customer >= c.usage_limit_per_customer then
      return query select false, 0::numeric, 'استخدمت هذا الكود من قبل'::text, null::uuid; return;
    end if;
  end if;
  if c.min_order_amount is not null and p_subtotal < c.min_order_amount then
    return query select false, 0::numeric,
      ('الحد الأدنى للطلب ' || c.min_order_amount::text || ' ج.س')::text, null::uuid; return;
  end if;

  if c.type = 'percentage' then
    v_discount := app.money(p_subtotal * c.value / 100);
    if c.max_discount_amount is not null then
      v_discount := least(v_discount, c.max_discount_amount);
    end if;
  else
    v_discount := least(c.value, p_subtotal);   -- الخصم لا يتجاوز المجموع
  end if;

  return query select true, app.money(v_discount), 'تم تطبيق الخصم'::text, c.id;
end;
$$;
