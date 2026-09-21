-- Atomic checkout: reads the caller's cart, creates one order + its
-- order_items, then empties the cart -- all in a single transaction so a
-- double-submit can never create two orders from the same cart (the second
-- call simply finds an empty cart and raises).
create or replace function public.checkout_cart(
  p_delivery_address jsonb,
  p_delivery_fee numeric default 0
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer_id uuid := auth.uid();
  v_order_id uuid;
  v_subtotal numeric(12, 2);
begin
  if v_customer_id is null then
    raise exception 'authentication required';
  end if;

  select coalesce(sum(p.price * c.quantity), 0)
  into v_subtotal
  from public.cart_items c
  join public.products p on p.id = c.product_id
  where c.customer_id = v_customer_id;

  if v_subtotal = 0 then
    raise exception 'cart is empty';
  end if;

  insert into public.orders (customer_id, delivery_address, delivery_fee, subtotal, discount, total)
  values (v_customer_id, p_delivery_address, p_delivery_fee, v_subtotal, 0, v_subtotal + p_delivery_fee)
  returning id into v_order_id;

  insert into public.order_items (order_id, store_id, product_id, quantity, unit_price, options)
  select v_order_id, p.store_id, c.product_id, c.quantity, p.price, c.options
  from public.cart_items c
  join public.products p on p.id = c.product_id
  where c.customer_id = v_customer_id;

  delete from public.cart_items where customer_id = v_customer_id;

  return v_order_id;
end;
$$;

revoke execute on function public.checkout_cart(jsonb, numeric) from public, anon;
grant execute on function public.checkout_cart(jsonb, numeric) to authenticated;
