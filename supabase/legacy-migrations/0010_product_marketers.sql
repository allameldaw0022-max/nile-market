-- Product marketers (Sudanese-style): a marketer takes a customer's order
-- by phone/WhatsApp and enters it into the system on their behalf for one
-- store. Reuses the existing orders/order_items + order_status pipeline
-- (spec: "نفس حالات الطلب الموجودة في التطبيق") instead of a parallel
-- order system.

-- allow signup to also request the "marketer" role
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    case
      when requested_role = 'seller' then 'seller'::public.user_role
      when requested_role = 'marketer' then 'marketer'::public.user_role
      else 'customer'::public.user_role
    end
  );
  return new;
end;
$$;

-- a marketer-placed order has no registered customer -- the marketer
-- enters the end customer's name/phone/address by hand
alter table public.orders alter column customer_id drop not null;
alter table public.orders add column placed_by_marketer_id uuid references public.profiles (id);
alter table public.orders add column guest_customer_name text;
alter table public.orders add column guest_customer_phone text;
alter table public.orders add constraint orders_customer_or_guest_check check (
  customer_id is not null or placed_by_marketer_id is not null
);

-- commission on the line item that earned it, computed once at order
-- creation time from the store's own rate (never recomputed later, so a
-- rate change never rewrites history)
alter table public.order_items add column commission_amount numeric(12, 2) not null default 0;
alter table public.order_items add column commission_paid boolean not null default false;

-- each store decides its own marketer commission % and payout cadence
alter table public.stores add column marketer_commission_rate numeric(5, 2) not null default 0
  check (marketer_commission_rate >= 0 and marketer_commission_rate <= 100);
alter table public.stores add column marketer_payout_cycle text not null default 'per_order'
  check (marketer_payout_cycle in ('daily', 'weekly', 'per_order'));

-- ---------------------------------------------------------------------
-- RLS: orders/order_items policies need to also cover the marketer path
-- ---------------------------------------------------------------------
create policy "orders: marketer read own" on public.orders
  for select using (placed_by_marketer_id = auth.uid());

create policy "orders: marketer insert own" on public.orders
  for insert with check (placed_by_marketer_id = auth.uid());

create policy "order_items: marketer read own" on public.order_items
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and o.placed_by_marketer_id = auth.uid())
  );

create policy "order_items: marketer insert own" on public.order_items
  for insert with check (
    exists (select 1 from public.orders o where o.id = order_id and o.placed_by_marketer_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- atomic marketer order creation (single store, single product line
-- -- matches the described flow: marketer picks one store, one product,
-- a quantity, and the guest customer's details)
-- ---------------------------------------------------------------------
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

  insert into public.order_items (order_id, store_id, product_id, quantity, unit_price, options, commission_amount)
  values (v_order_id, p_store_id, p_product_id, p_quantity, v_price, p_options, v_commission);

  return v_order_id;
end;
$$;

revoke execute on function public.create_marketer_order(uuid, uuid, integer, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_marketer_order(uuid, uuid, integer, text, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- withdrawal requests (marketer's payout of earned, unpaid commission)
-- ---------------------------------------------------------------------
create type public.withdrawal_status as enum ('pending', 'approved', 'rejected', 'paid');

create table public.marketer_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  marketer_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  status public.withdrawal_status not null default 'pending',
  payment_reference text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.marketer_withdrawal_requests enable row level security;

create policy "withdrawals: marketer manage own" on public.marketer_withdrawal_requests
  for all using (marketer_id = auth.uid());

create policy "withdrawals: admin full access" on public.marketer_withdrawal_requests
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- approving/marking-paid a withdrawal marks exactly the order_items that
-- funded it as paid, atomically, so the same commission can never be paid
-- twice and the paid total always matches real earned/unpaid line items
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
    join public.orders o on o.id = oi.order_id
    where o.placed_by_marketer_id = v_request.marketer_id
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

revoke execute on function public.mark_withdrawal_paid(uuid, text) from public, anon;
grant execute on function public.mark_withdrawal_paid(uuid, text) to authenticated;
