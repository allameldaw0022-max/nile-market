-- Hybrid affiliate model: keep the existing "marketer enters the order
-- for the customer" flow (order_source = affiliate_assisted) and add a
-- shareable link/code on top so a customer can also order themselves
-- after clicking a marketer's link (order_source = affiliate_link), or
-- with no marketer at all (order_source = direct).
--
-- Double-commission is prevented structurally, not by a runtime check:
-- an order_item is created exactly once, by exactly one of the two
-- creation paths (checkout_cart for a customer's own cart, or
-- create_marketer_order for an assisted order), and each path sets
-- marketer_id/order_source itself -- there is no code path that could
-- set both, or set them twice for the same row.

-- Every marketer gets a short shareable code (not the raw profile id --
-- nicer to paste into WhatsApp). Existing marketers get one backfilled;
-- new ones get one at signup via the updated handle_new_user() below.
alter table public.profiles add column marketer_code text unique;

update public.profiles
set marketer_code = substr(encode(gen_random_bytes(5), 'hex'), 1, 8)
where role = 'marketer' and marketer_code is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
  requested_referral text := new.raw_user_meta_data ->> 'referral_code';
  v_marketer_id uuid;
  v_role public.user_role;
begin
  v_role := case
    when requested_role = 'seller' then 'seller'::public.user_role
    when requested_role = 'marketer' then 'marketer'::public.user_role
    else 'customer'::public.user_role
  end;

  if requested_referral is not null then
    select id into v_marketer_id
    from public.platform_marketers
    where referral_code = requested_referral and is_active = true;
  end if;

  insert into public.profiles (id, full_name, role, referred_by_marketer_id, marketer_code)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    v_role,
    v_marketer_id,
    case when v_role = 'marketer' then substr(encode(gen_random_bytes(5), 'hex'), 1, 8) else null end
  );
  return new;
end;
$$;

-- Public, read-only: resolve a marketer's share code to their profile id
-- so an anonymous visitor's browser can tag a cart line without exposing
-- anything about the marketer beyond "this code is valid".
create or replace function public.resolve_marketer_code(p_code text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.profiles where marketer_code = p_code and role = 'marketer' limit 1;
$$;

revoke execute on function public.resolve_marketer_code(text) from public;
grant execute on function public.resolve_marketer_code(text) to anon, authenticated;

-- Click tracking (spec: "متابعة النقرات"). Insert-only from the visitor's
-- side (even anonymous), readable only by the marketer who owns them or
-- admin.
create table public.product_marketer_clicks (
  id uuid primary key default gen_random_uuid(),
  marketer_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  visitor_id text,
  created_at timestamptz not null default now()
);

create index product_marketer_clicks_marketer_id_idx on public.product_marketer_clicks (marketer_id);

alter table public.product_marketer_clicks enable row level security;

create policy "clicks: anyone insert" on public.product_marketer_clicks
  for insert with check (true);

create policy "clicks: marketer read own" on public.product_marketer_clicks
  for select using (marketer_id = auth.uid());

create policy "clicks: admin read all" on public.product_marketer_clicks
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- A visitor's cart line remembers which marketer's link brought them to
-- that product, captured client-side at add-to-cart time (see
-- AddToCartButton) -- validated here only insofar as it must be a real
-- profile id; the actual commission math still happens server-side in
-- checkout_cart, never trusting a client-supplied amount.
alter table public.cart_items add column referred_by_marketer_id uuid references public.profiles (id);

-- order_items gets the same two fields as create_marketer_order's rows
-- already have implicitly (via orders.placed_by_marketer_id) -- made
-- explicit and first-class here so every order_item, from either
-- creation path, carries its own clear source.
create type public.order_source as enum ('direct', 'affiliate_link', 'affiliate_assisted');

alter table public.order_items add column marketer_id uuid references public.profiles (id);
alter table public.order_items add column order_source public.order_source not null default 'direct';

-- checkout_cart now also attributes + computes commission for any cart
-- line that carries a marketer referral, exactly like create_marketer_order
-- already does for assisted orders -- same server-side rate lookup, same
-- "never trust the client for money" rule.
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

  insert into public.order_items (
    order_id, store_id, product_id, quantity, unit_price, options,
    marketer_id, order_source, commission_amount
  )
  select
    v_order_id, p.store_id, c.product_id, c.quantity, p.price, c.options,
    c.referred_by_marketer_id,
    case when c.referred_by_marketer_id is not null then 'affiliate_link'::public.order_source else 'direct'::public.order_source end,
    case
      when c.referred_by_marketer_id is not null
        then round(p.price * c.quantity * coalesce(s.marketer_commission_rate, 0) / 100, 2)
      else 0
    end
  from public.cart_items c
  join public.products p on p.id = c.product_id
  join public.stores s on s.id = p.store_id
  where c.customer_id = v_customer_id;

  delete from public.cart_items where customer_id = v_customer_id;

  return v_order_id;
end;
$$;

-- create_marketer_order now stamps order_source explicitly (was implicit
-- via orders.placed_by_marketer_id before).
create or replace function public.create_marketer_order(
  p_store_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_guest_name text,
  p_guest_phone text,
  p_delivery_address jsonb,
  p_options jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_marketer_id uuid := auth.uid();
  v_price numeric(12, 2);
  v_commission_rate numeric(5, 2);
  v_subtotal numeric(12, 2);
  v_commission numeric(12, 2);
  v_order_id uuid;
begin
  if v_marketer_id is null then
    raise exception 'authentication required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_marketer_id and p.role = 'marketer') then
    raise exception 'marketer role required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid quantity';
  end if;

  select price, coalesce((select s.marketer_commission_rate from public.stores s where s.id = p_store_id), 0)
  into v_price, v_commission_rate
  from public.products
  where id = p_product_id and store_id = p_store_id and status = 'active';

  if v_price is null then
    raise exception 'product not found in this store';
  end if;

  v_subtotal := v_price * p_quantity;
  v_commission := round(v_subtotal * v_commission_rate / 100, 2);

  insert into public.orders (placed_by_marketer_id, guest_customer_name, guest_customer_phone, delivery_address, subtotal, total)
  values (v_marketer_id, p_guest_name, p_guest_phone, p_delivery_address, v_subtotal, v_subtotal)
  returning id into v_order_id;

  insert into public.order_items (
    order_id, store_id, product_id, quantity, unit_price, options,
    marketer_id, order_source, commission_amount
  )
  values (
    v_order_id, p_store_id, p_product_id, p_quantity, v_price, p_options,
    v_marketer_id, 'affiliate_assisted', v_commission
  );

  return v_order_id;
end;
$$;

-- marketer needs to read order_items/orders attributed to them via a link
-- (previously only their own *placed* orders were readable)
create policy "order_items: marketer read attributed" on public.order_items
  for select using (marketer_id = auth.uid());

-- marketer_id/order_source are attribution, same trust level as the
-- commission fields they drive -- a store owner (who can otherwise
-- update order_items freely for status changes) must not be able to
-- reassign who gets credit for a sale.
create or replace function public.protect_commission_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.commission_amount is distinct from old.commission_amount)
     or (new.commission_paid is distinct from old.commission_paid)
     or (new.marketer_id is distinct from old.marketer_id)
     or (new.order_source is distinct from old.order_source) then
    if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
      new.commission_amount = old.commission_amount;
      new.commission_paid = old.commission_paid;
      new.marketer_id = old.marketer_id;
      new.order_source = old.order_source;
    end if;
  end if;
  return new;
end;
$$;

create policy "orders: marketer read attributed via items" on public.orders
  for select using (
    exists (
      select 1 from public.order_items oi
      where oi.order_id = orders.id and oi.marketer_id = auth.uid()
    )
  );

-- mark_withdrawal_paid now settles against order_items.marketer_id
-- directly (covers both affiliate_assisted and affiliate_link rows),
-- instead of only orders.placed_by_marketer_id which affiliate_link
-- orders never set.
create or replace function public.mark_withdrawal_paid(p_request_id uuid, p_payment_reference text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request public.marketer_withdrawal_requests%rowtype;
  v_remaining numeric(12, 2);
  v_item record;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'admin only';
  end if;

  select * into v_request from public.marketer_withdrawal_requests where id = p_request_id for update;
  if not found then
    raise exception 'withdrawal request not found';
  end if;
  if v_request.status not in ('pending', 'approved') then
    raise exception 'withdrawal already finalized';
  end if;

  v_remaining := v_request.amount;

  for v_item in
    select oi.id, oi.commission_amount
    from public.order_items oi
    where oi.marketer_id = v_request.marketer_id
      and oi.status = 'delivered'
      and oi.commission_paid = false
      and oi.commission_amount > 0
    order by oi.created_at asc
  loop
    exit when v_remaining <= 0;
    update public.order_items set commission_paid = true where id = v_item.id;
    v_remaining := v_remaining - v_item.commission_amount;
  end loop;

  update public.marketer_withdrawal_requests
  set status = 'paid', payment_reference = p_payment_reference, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;
end;
$$;
