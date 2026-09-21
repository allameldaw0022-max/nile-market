-- Platform commission: the cut Nile Market itself takes from every seller,
-- separate from a seller's own marketer_commission_rate. Admin sets a
-- global default and can override it per store; the rate is snapshotted
-- onto each order_item at creation time so a later rate change never
-- affects historical orders (matches how marketer commission already works).

create table public.platform_settings (
  id boolean primary key default true check (id),
  default_platform_commission_rate numeric(5, 2) not null default 5,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (true);

alter table public.platform_settings enable row level security;

create policy "platform_settings: admin read" on public.platform_settings
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "platform_settings: admin update" on public.platform_settings
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Nullable at insert on purpose: a BEFORE INSERT trigger fills it from the
-- platform default, but an admin's later UPDATE (including to 0) is never
-- overwritten because that trigger only fires on INSERT.
alter table public.stores add column platform_commission_rate numeric(5, 2);

update public.stores
set platform_commission_rate = coalesce(
  (select default_platform_commission_rate from public.platform_settings limit 1), 0
)
where platform_commission_rate is null;

alter table public.stores alter column platform_commission_rate set not null;

create or replace function public.set_default_platform_commission_rate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.platform_commission_rate is null then
    select default_platform_commission_rate into new.platform_commission_rate
    from public.platform_settings limit 1;
  end if;
  return new;
end;
$$;

create trigger trg_set_default_platform_commission_rate
before insert on public.stores
for each row execute function public.set_default_platform_commission_rate();

-- Only admin may change a store's platform commission rate -- the seller
-- owns their own marketer_commission_rate but never the platform's cut.
create or replace function public.protect_platform_commission_rate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.platform_commission_rate is distinct from old.platform_commission_rate then
    if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
      new.platform_commission_rate = old.platform_commission_rate;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_protect_platform_commission_rate
before update on public.stores
for each row execute function public.protect_platform_commission_rate();

-- Snapshot columns on order_items: the rate and computed amount at the
-- moment the order was placed.
alter table public.order_items add column platform_commission_rate numeric(5, 2) not null default 0;
alter table public.order_items add column platform_commission_amount numeric(12, 2) not null default 0;

-- Extend the existing commission-field guard to also cover the new columns.
create or replace function public.protect_commission_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.commission_amount is distinct from old.commission_amount)
     or (new.commission_paid is distinct from old.commission_paid)
     or (new.marketer_id is distinct from old.marketer_id)
     or (new.order_source is distinct from old.order_source)
     or (new.platform_commission_rate is distinct from old.platform_commission_rate)
     or (new.platform_commission_amount is distinct from old.platform_commission_amount) then
    if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
      new.commission_amount = old.commission_amount;
      new.commission_paid = old.commission_paid;
      new.marketer_id = old.marketer_id;
      new.order_source = old.order_source;
      new.platform_commission_rate = old.platform_commission_rate;
      new.platform_commission_amount = old.platform_commission_amount;
    end if;
  end if;
  return new;
end;
$$;

-- checkout_cart(): snapshot platform_commission_rate/amount per line
-- alongside the existing marketer commission snapshot.
create or replace function public.checkout_cart(p_delivery_address jsonb, p_delivery_fee numeric DEFAULT 0)
returns uuid
language plpgsql
set search_path = public
as $function$
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
    marketer_id, order_source, commission_amount,
    platform_commission_rate, platform_commission_amount
  )
  select
    v_order_id, p.store_id, c.product_id, c.quantity, p.price, c.options,
    c.referred_by_marketer_id,
    case when c.referred_by_marketer_id is not null then 'affiliate_link'::public.order_source else 'direct'::public.order_source end,
    case
      when c.referred_by_marketer_id is not null
        then round(p.price * c.quantity * coalesce(s.marketer_commission_rate, 0) / 100, 2)
      else 0
    end,
    s.platform_commission_rate,
    round(p.price * c.quantity * s.platform_commission_rate / 100, 2)
  from public.cart_items c
  join public.products p on p.id = c.product_id
  join public.stores s on s.id = p.store_id
  where c.customer_id = v_customer_id;

  delete from public.cart_items where customer_id = v_customer_id;

  return v_order_id;
end;
$function$;

-- create_marketer_order(): same snapshot addition.
create or replace function public.create_marketer_order(
  p_store_id uuid, p_product_id uuid, p_quantity integer,
  p_guest_name text, p_guest_phone text, p_delivery_address jsonb,
  p_options jsonb DEFAULT '{}'::jsonb
)
returns uuid
language plpgsql
set search_path = public
as $function$
declare
  v_marketer_id uuid := auth.uid();
  v_price numeric(12, 2);
  v_commission_rate numeric(5, 2);
  v_platform_rate numeric(5, 2);
  v_subtotal numeric(12, 2);
  v_commission numeric(12, 2);
  v_platform_commission numeric(12, 2);
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

  select pr.price, coalesce(s.marketer_commission_rate, 0), coalesce(s.platform_commission_rate, 0)
  into v_price, v_commission_rate, v_platform_rate
  from public.products pr
  join public.stores s on s.id = pr.store_id
  where pr.id = p_product_id and pr.store_id = p_store_id and pr.status = 'active';

  if v_price is null then
    raise exception 'product not found in this store';
  end if;

  v_subtotal := v_price * p_quantity;
  v_commission := round(v_subtotal * v_commission_rate / 100, 2);
  v_platform_commission := round(v_subtotal * v_platform_rate / 100, 2);

  insert into public.orders (placed_by_marketer_id, guest_customer_name, guest_customer_phone, delivery_address, subtotal, total)
  values (v_marketer_id, p_guest_name, p_guest_phone, p_delivery_address, v_subtotal, v_subtotal)
  returning id into v_order_id;

  insert into public.order_items (
    order_id, store_id, product_id, quantity, unit_price, options,
    marketer_id, order_source, commission_amount,
    platform_commission_rate, platform_commission_amount
  )
  values (
    v_order_id, p_store_id, p_product_id, p_quantity, v_price, p_options,
    v_marketer_id, 'affiliate_assisted', v_commission,
    v_platform_rate, v_platform_commission
  );

  return v_order_id;
end;
$function$;
