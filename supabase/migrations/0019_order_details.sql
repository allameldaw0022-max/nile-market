-- =====================================================================
-- 0019 تفاصيل طلب للزبون (إضافية · لا تمسّ ما سبق)
--
-- `orders` لا سياسة قراءة لـanon عن قصد: الزائر لا هوية له تُرشَّح
-- عليها الصفوف. لكن صفحة «تم الطلب» وصفحة التتبّع تحتاجان تفاصيل
-- الطلب فورًا وبلا حساب.
--
-- البوابة: توكن الطلب (يُولَّده create_order ويُخزَّن في كوكي HttpOnly)
-- أو رقم الطلب + الهاتف. الرقم متسلسل وقابل للتخمين، فلا يُقبل وحده.
-- =====================================================================

create or replace function public.order_details(
  p_store_id     uuid,
  p_order_number text,
  p_guest_token  text default null,
  p_phone        text default null
)
returns table (
  order_id          uuid,
  order_number      text,
  status            public.order_status,
  payment_status    public.order_payment_status,
  payment_method    public.payment_method,
  contact_name      text,
  contact_phone     text,
  delivery_zone_name text,
  delivery_address  jsonb,
  subtotal          numeric,
  delivery_fee      numeric,
  discount_total    numeric,
  total             numeric,
  coupon_code       text,
  note              text,
  created_at        timestamptz,
  items             jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
-- أسماء أعمدة المخرجات تطابق أعمدة orders؛ القاعدة: العمود يفوز،
-- والمتغيّرات كلها بأسماء o./v_/p_ فلا يلتبس شيء.
#variable_conflict use_column
declare
  o public.orders%rowtype;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if coalesce(trim(p_order_number), '') = '' then
    raise exception 'VALIDATION: رقم الطلب مطلوب' using errcode = 'P0001';
  end if;

  select * into o from public.orders
   where store_id = p_store_id
     and upper(trim(order_number)) = upper(trim(p_order_number));
  if not found then return; end if;

  -- ★ لا يُعاد الطلب إلا لمن أثبت صلته به
  if not (
    (coalesce(trim(p_guest_token), '') <> '' and o.guest_token = p_guest_token)
    or (length(v_digits) >= 7
        and right(regexp_replace(coalesce(o.contact_phone, ''), '\D', '', 'g'), 9)
          = right(v_digits, 9))
    or (o.customer_id is not null
        and o.customer_id = app.current_customer_id(p_store_id))
    or app.has_store_permission(p_store_id, 'orders:view')
  ) then
    return;
  end if;

  return query
  select o.id, o.order_number, o.status, o.payment_status, o.payment_method,
         o.contact_name, o.contact_phone, o.delivery_zone_name, o.delivery_address,
         o.subtotal, o.delivery_fee, o.discount_total, o.total,
         o.coupon_code, o.note, o.created_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'product_name', oi.product_name,
                    'variant_name', oi.variant_name,
                    'unit_price',   oi.unit_price,
                    'quantity',     oi.quantity,
                    'line_total',   oi.line_total)
                  order by oi.created_at)
             from public.order_items oi where oi.order_id = o.id
         ), '[]'::jsonb);
end;
$$;

revoke execute on function public.order_details(uuid, text, text, text) from public;
grant   execute on function public.order_details(uuid, text, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- طلبات العميل المسجَّل في متجر واحد (D22: لا تسرّب بين المتاجر)
-- ---------------------------------------------------------------------
create or replace function public.my_orders(p_store_id uuid)
returns table (
  order_id uuid, order_number text, status public.order_status,
  payment_status public.order_payment_status, total numeric,
  created_at timestamptz, item_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.order_number, o.status, o.payment_status, o.total, o.created_at,
         (select coalesce(sum(oi.quantity), 0)::integer
            from public.order_items oi where oi.order_id = o.id)
    from public.orders o
   where o.store_id = p_store_id
     and o.customer_id is not null
     and o.customer_id = app.current_customer_id(p_store_id)
   order by o.created_at desc
   limit 50;
$$;

revoke execute on function public.my_orders(uuid) from public, anon;
grant   execute on function public.my_orders(uuid) to authenticated;
