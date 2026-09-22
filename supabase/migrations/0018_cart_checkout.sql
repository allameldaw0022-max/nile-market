-- =====================================================================
-- 0018 السلة والمعاينة وتتبّع الطلب (إضافية · لا تمسّ ما سبق)
--
-- سلة الزائر: لا سياسة RLS لدور anon على `carts` (0005) عن قصد —
-- الزائر لا يملك هوية تُرشَّح عليها الصفوف. البديل هنا دوال
-- SECURITY DEFINER تتحقق من **ملكية** السلة بتوكن يُولَّد خادميًا
-- ويُخزَّن في كوكي HttpOnly، فلا يقرأه سكربت في الصفحة ولا يُخمَّن
-- (32 بايت عشوائيًا).
--
-- كل مبلغ في `quote_checkout` يُقرأ من القاعدة: المعاينة تعطي نفس
-- أرقام `create_order` بلا أي حساب في المتصفح (D10).
-- =====================================================================

-- ---------------------------------------------------------------------
-- تحديد السلة الحالية للفاعل. `p_create` ⇒ تُنشأ إن لم توجد.
-- ---------------------------------------------------------------------
create or replace function app.resolve_cart(
  p_store_id   uuid,
  p_anon_token text,
  p_create     boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id   uuid;
begin
  if v_user is not null then
    select id into v_id from public.carts
     where store_id = p_store_id and profile_id = v_user and status = 'active';
    if v_id is null and p_create then
      insert into public.carts (store_id, profile_id) values (p_store_id, v_user)
      on conflict (store_id, profile_id) where status = 'active' and profile_id is not null
      do update set updated_at = now()
      returning id into v_id;
    end if;
    return v_id;
  end if;

  if coalesce(trim(p_anon_token), '') = '' then
    if p_create then
      raise exception 'CART_TOKEN_REQUIRED' using errcode = 'P0001';
    end if;
    return null;
  end if;

  select id into v_id from public.carts
   where store_id = p_store_id and anon_token = p_anon_token and status = 'active';
  if v_id is null and p_create then
    insert into public.carts (store_id, anon_token) values (p_store_id, p_anon_token)
    on conflict (store_id, anon_token) where status = 'active' and anon_token is not null
    do update set updated_at = now()
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- إضافة عنصر. الكمية تُجمَع على الموجود (UPSERT على الفهرس الفريد).
-- ---------------------------------------------------------------------
create or replace function public.cart_add_item(
  p_store_id   uuid,
  p_product_id uuid,
  p_quantity   integer default 1,
  p_variant_id uuid default null,
  p_anon_token text default null
)
returns table (cart_id uuid, quantity integer)
language plpgsql
security definer
set search_path = ''
as $$
-- أسماء أعمدة المخرجات (cart_id · quantity) تطابق أعمدة cart_items،
-- و`on conflict` لا يقبل الالتباس. القاعدة هنا: العمود يفوز، والمتغيّرات
-- كلها بأسماء v_/p_ فلا يلتبس شيء.
#variable_conflict use_column
declare
  v_cart uuid;
  v_qty  integer;
  v_track boolean;
  v_available integer;
begin
  if coalesce(p_quantity, 0) <= 0 or p_quantity > 999 then
    raise exception 'INVALID_QUANTITY: كمية غير صالحة' using errcode = 'P0001';
  end if;

  -- المنتج يجب أن يكون منشورًا في هذا المتجر تحديدًا
  select track_inventory into v_track from public.products
   where id = p_product_id and store_id = p_store_id
     and status = 'active' and deleted_at is null;
  if not found then
    raise exception 'PRODUCT_UNAVAILABLE: المنتج غير متاح' using errcode = 'P0002';
  end if;

  if p_variant_id is not null and not exists (
    select 1 from public.product_variants
    where id = p_variant_id and product_id = p_product_id
      and is_active and deleted_at is null
  ) then
    raise exception 'VARIANT_UNAVAILABLE: خيار المنتج غير متاح' using errcode = 'P0002';
  end if;

  v_cart := app.resolve_cart(p_store_id, p_anon_token, true);

  insert into public.cart_items (cart_id, store_id, product_id, variant_id, quantity)
  values (v_cart, p_store_id, p_product_id, p_variant_id, p_quantity)
  on conflict (cart_id, product_id,
               coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set quantity = least(public.cart_items.quantity + p_quantity, 999)
  returning public.cart_items.quantity into v_qty;

  -- المتوفّر يُفحص هنا كتنبيه مبكر فقط؛ الحجز الفعلي في create_order
  -- داخل نفس معاملة الطلب، فلا يُحتجز مخزون بمجرد وضعه في سلة.
  if v_track then
    select greatest(quantity - reserved, 0) into v_available from public.inventory
     where product_id = p_product_id
       and coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(p_variant_id, '00000000-0000-0000-0000-000000000000'::uuid);
    if coalesce(v_available, 0) = 0 then
      raise exception 'OUT_OF_STOCK: هذا المنتج غير متوفر حاليًا' using errcode = 'P0001';
    end if;
  end if;

  return query select v_cart, v_qty;
end;
$$;

revoke execute on function public.cart_add_item(uuid, uuid, integer, uuid, text) from public;
grant   execute on function public.cart_add_item(uuid, uuid, integer, uuid, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- تغيير كمية عنصر · الصفر يحذفه
-- ---------------------------------------------------------------------
create or replace function public.cart_set_quantity(
  p_store_id   uuid,
  p_item_id    uuid,
  p_quantity   integer,
  p_anon_token text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_cart uuid;
begin
  if p_quantity is null or p_quantity < 0 or p_quantity > 999 then
    raise exception 'INVALID_QUANTITY: كمية غير صالحة' using errcode = 'P0001';
  end if;

  -- ★ الملكية تُتحقق من السلة المحسوبة للفاعل، لا من معرّف يرسله
  v_cart := app.resolve_cart(p_store_id, p_anon_token, false);
  if v_cart is null then
    raise exception 'NOT_FOUND: لا توجد سلة' using errcode = 'P0002';
  end if;

  if p_quantity = 0 then
    delete from public.cart_items where id = p_item_id and cart_id = v_cart;
  else
    update public.cart_items set quantity = p_quantity
     where id = p_item_id and cart_id = v_cart;
  end if;

  if not found then
    raise exception 'NOT_FOUND: العنصر غير موجود في سلتك' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.cart_set_quantity(uuid, uuid, integer, text) from public;
grant   execute on function public.cart_set_quantity(uuid, uuid, integer, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- قراءة السلة — السعر يُقرأ من المنتج لحظة القراءة لا من السلة
-- ---------------------------------------------------------------------
create or replace function public.get_cart(
  p_store_id   uuid,
  p_anon_token text default null
)
returns table (
  cart_id uuid, item_id uuid, product_id uuid, variant_id uuid,
  product_name text, variant_name text, unit_price numeric, quantity integer,
  line_total numeric, available integer, image_path text, image_bucket text,
  product_slug text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_cart uuid;
begin
  v_cart := app.resolve_cart(p_store_id, p_anon_token, false);
  if v_cart is null then return; end if;

  return query
  select
    v_cart,
    ci.id,
    p.id,
    pv.id,
    p.name,
    pv.name,
    app.money(coalesce(pv.price, p.price)),
    ci.quantity,
    app.money(coalesce(pv.price, p.price) * ci.quantity),
    case when p.track_inventory
         then greatest(coalesce(inv.quantity, 0) - coalesce(inv.reserved, 0), 0)
         else 999 end,
    mf.path,
    mf.bucket,
    p.slug
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  left join public.product_variants pv
         on pv.id = ci.variant_id and pv.deleted_at is null
  left join public.inventory inv
         on inv.product_id = p.id
        and coalesce(inv.variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(ci.variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  left join public.product_images pi
         on pi.product_id = p.id and pi.is_primary
  left join public.media_files mf
         on mf.id = pi.media_file_id and mf.status = 'ready'
  where ci.cart_id = v_cart
    and p.status = 'active' and p.deleted_at is null
  order by ci.added_at;
end;
$$;

revoke execute on function public.get_cart(uuid, text) from public;
grant   execute on function public.get_cart(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- دمج سلة الزائر في سلة المسجّل عند تسجيل الدخول
-- ---------------------------------------------------------------------
create or replace function public.cart_merge_guest(
  p_store_id   uuid,
  p_anon_token text
)
returns table (cart_id uuid, merged integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user  uuid := (select auth.uid());
  v_guest uuid;
  v_mine  uuid;
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if coalesce(trim(p_anon_token), '') = '' then
    return query select app.resolve_cart(p_store_id, null, true), 0;
    return;
  end if;

  select id into v_guest from public.carts
   where store_id = p_store_id and anon_token = p_anon_token and status = 'active';

  v_mine := app.resolve_cart(p_store_id, null, true);

  if v_guest is null or v_guest = v_mine then
    return query select v_mine, 0;
    return;
  end if;

  -- الكميات تُجمَع على الفهرس الفريد ⇒ لا عنصر مكرر بعد الدمج
  with moved as (
    insert into public.cart_items (cart_id, store_id, product_id, variant_id, quantity)
    select v_mine, gi.store_id, gi.product_id, gi.variant_id, gi.quantity
      from public.cart_items gi where gi.cart_id = v_guest
    on conflict (cart_id, product_id,
                 coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do update set quantity = least(public.cart_items.quantity + excluded.quantity, 999)
    returning 1
  )
  select count(*)::integer into v_count from moved;

  -- سلة الزائر تُوسم مهجورة لا تُحذف: بياناتها مصدر تحليل للتاجر
  delete from public.cart_items where cart_id = v_guest;
  update public.carts set status = 'abandoned' where id = v_guest;

  return query select v_mine, v_count;
end;
$$;

revoke execute on function public.cart_merge_guest(uuid, text) from public, anon;
grant   execute on function public.cart_merge_guest(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- معاينة الحساب — نفس منطق create_order بلا إنشاء طلب
-- ---------------------------------------------------------------------
create or replace function public.quote_checkout(
  p_store_id    uuid,
  p_anon_token  text default null,
  p_zone_id     uuid default null,
  p_coupon_code text default null
)
returns table (
  subtotal numeric, delivery_fee numeric, discount_total numeric, total numeric,
  coupon_valid boolean, coupon_message text, can_checkout boolean,
  out_of_stock boolean, item_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subtotal numeric(14,2) := 0;
  v_delivery numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_zone     public.delivery_zones%rowtype;
  v_coupon   record;
  v_valid    boolean := false;
  v_message  text := null;
  v_short    boolean := false;
  v_count    integer := 0;
begin
  select coalesce(sum(c.line_total), 0),
         coalesce(sum(c.quantity), 0),
         bool_or(c.quantity > c.available)
    into v_subtotal, v_count, v_short
    from public.get_cart(p_store_id, p_anon_token) c;

  if p_zone_id is not null then
    select * into v_zone from public.delivery_zones
     where id = p_zone_id and store_id = p_store_id and is_active and deleted_at is null;
    if not found then
      raise exception 'INVALID_ZONE: منطقة التوصيل غير صالحة' using errcode = 'P0001';
    end if;
    v_delivery := v_zone.fee;
    if v_zone.min_order_free is not null and v_subtotal >= v_zone.min_order_free then
      v_delivery := 0;
    end if;
  end if;

  if coalesce(trim(p_coupon_code), '') <> '' then
    select * into v_coupon from public.validate_coupon(
      p_store_id, p_coupon_code, v_subtotal, app.current_customer_id(p_store_id));
    v_valid   := v_coupon.valid;
    v_message := v_coupon.message;
    if v_valid then v_discount := v_coupon.discount; end if;
  end if;

  return query select
    app.money(v_subtotal),
    app.money(v_delivery),
    app.money(v_discount),
    app.money(greatest(v_subtotal + v_delivery - v_discount, 0)),
    v_valid,
    v_message,
    app.store_can_checkout(p_store_id),
    coalesce(v_short, false),
    v_count;
end;
$$;

revoke execute on function public.quote_checkout(uuid, text, uuid, text) from public;
grant   execute on function public.quote_checkout(uuid, text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- تتبّع طلب الزائر — رقم الطلب + الهاتف
--
-- لماذا الهاتف؟ رقم الطلب متسلسل وقابل للتخمين. اشتراط مطابقة الهاتف
-- يجعل التخمين بلا قيمة، ومقارنة الأرقام تكون على الأرقام وحدها حتى
-- لا يفشل التطابق على مسافة أو رمز بلد.
-- ---------------------------------------------------------------------
create or replace function public.track_order(
  p_store_id     uuid,
  p_order_number text,
  p_phone        text
)
returns table (
  order_id uuid, order_number text, status public.order_status,
  payment_status public.order_payment_status, total numeric,
  created_at timestamptz, item_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(v_digits) < 7 or coalesce(trim(p_order_number), '') = '' then
    raise exception 'VALIDATION: رقم الطلب ورقم الهاتف مطلوبان' using errcode = 'P0001';
  end if;

  return query
  select o.id, o.order_number, o.status, o.payment_status, o.total, o.created_at,
         (select coalesce(sum(oi.quantity), 0)::integer
            from public.order_items oi where oi.order_id = o.id)
    from public.orders o
   where o.store_id = p_store_id
     and upper(trim(o.order_number)) = upper(trim(p_order_number))
     and right(regexp_replace(coalesce(o.contact_phone, ''), '\D', '', 'g'), 9)
       = right(v_digits, 9);
end;
$$;

revoke execute on function public.track_order(uuid, text, text) from public;
grant   execute on function public.track_order(uuid, text, text) to anon, authenticated;
