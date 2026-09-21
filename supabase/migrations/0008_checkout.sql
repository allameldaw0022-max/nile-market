-- =====================================================================
-- 0007 Checkout — حساب المبالغ خادميًا بالكامل
--
-- D10 + S2: لا سعر ولا رسوم توصيل ولا خصم يأتي من المتصفح.
-- المتصفح يرسل: معرّفات المنتجات والكميات · منطقة التوصيل · كود الكوبون
--               · بيانات الاتصال. لا شيء غير ذلك.
-- D14: متجر باشتراك منتهٍ ⇒ الشراء مرفوض في القاعدة، لا في الواجهة.
-- =====================================================================

-- ---------------------------------------------------------------------
-- validate_coupon — تعيد مبلغ الخصم فقط، لا صف الكوبون.
-- ⇒ لا تعداد أكواد ولا كشف شروط.
-- ---------------------------------------------------------------------
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
    if (select count(*) from public.coupon_redemptions where coupon_id = c.id)
       >= c.usage_limit_total then
      return query select false, 0::numeric, 'بلغ كود الخصم حد الاستخدام'::text, null::uuid; return;
    end if;
  end if;
  if c.usage_limit_per_customer is not null and p_customer_id is not null then
    select count(*) into v_used_by_customer
      from public.coupon_redemptions
     where coupon_id = c.id and customer_id = p_customer_id;
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

revoke execute on function public.validate_coupon(uuid, text, numeric, uuid) from public;
grant   execute on function public.validate_coupon(uuid, text, numeric, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- حجز رقم طلب متسلسل بلا سباق
-- ---------------------------------------------------------------------
create or replace function app.next_order_number(p_store_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_num bigint;
  v_prefix text;
begin
  insert into public.store_order_sequences (store_id, next_number)
  values (p_store_id, 1)
  on conflict (store_id) do update set next_number = public.store_order_sequences.next_number + 1
  returning next_number into v_num;

  select coalesce(nullif(trim(order_prefix), ''), 'NM')
    into v_prefix from public.store_settings where store_id = p_store_id;

  return coalesce(v_prefix, 'NM') || '-' || lpad(v_num::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- ★ create_order — كل الحساب هنا، داخل معاملة واحدة.
-- ---------------------------------------------------------------------
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
  if p_payment_method = 'cash_on_delivery'
     and not (select cod_enabled from public.store_settings where store_id = p_store_id) then
    raise exception 'PAYMENT_METHOD_DISABLED: الدفع عند الاستلام غير مفعّل' using errcode = 'P0001';
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
  if coalesce(trim(p_coupon_code), '') <> '' then
    select * into v_coupon from public.validate_coupon(p_store_id, p_coupon_code, v_subtotal, null);
    if v_coupon.valid then
      v_discount  := v_coupon.discount;
      v_coupon_id := v_coupon.coupon_id;
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

revoke execute on function public.create_order(uuid, jsonb, uuid, jsonb, jsonb,
  public.payment_method, text, text, text, uuid) from public;
grant execute on function public.create_order(uuid, jsonb, uuid, jsonb, jsonb,
  public.payment_method, text, text, text, uuid) to anon, authenticated;
