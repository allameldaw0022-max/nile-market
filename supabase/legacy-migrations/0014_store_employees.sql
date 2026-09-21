-- Store employees (spec section 24): "الموظف تابع للمتجر وليس تاجرًا
-- مستقلاً" -- an employee is NOT a separate account role, just a grant of
-- store-scoped access. Their own profiles.role stays whatever it was
-- (usually 'customer'); access is entirely driven by this table. No
-- granular permission toggles are invented (none were specified) -- an
-- employee gets exactly what a store needs day-to-day: manage products,
-- work orders. Financial settings (commission rate, payout cycle,
-- subscription) stay owner-only.

create table public.store_employees (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (store_id, profile_id)
);

alter table public.store_employees enable row level security;

create policy "store_employees: owner manage" on public.store_employees
  for all using (
    exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );

create policy "store_employees: self read" on public.store_employees
  for select using (profile_id = auth.uid());

create policy "store_employees: admin full access" on public.store_employees
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- extend product/order management to employees of the store, alongside
-- the existing owner-only policies
create policy "products: employee manage" on public.products
  for all using (
    exists (
      select 1 from public.store_employees se
      where se.store_id = products.store_id and se.profile_id = auth.uid()
    )
  );

create policy "order_items: employee manage" on public.order_items
  for all using (
    exists (
      select 1 from public.store_employees se
      where se.store_id = order_items.store_id and se.profile_id = auth.uid()
    )
  );

create policy "orders: employee read via items" on public.orders
  for select using (
    exists (
      select 1 from public.order_items oi
      join public.store_employees se on se.store_id = oi.store_id
      where oi.order_id = orders.id and se.profile_id = auth.uid()
    )
  );

-- a store owner adding an employee only knows their email (profiles has
-- no email column -- it lives in auth.users, which regular users can't
-- query directly). This narrow lookup returns only a matching id or null,
-- for an existing registered account.
create or replace function public.find_profile_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
stable
as $$
  select id from auth.users where email = p_email limit 1;
$$;

revoke execute on function public.find_profile_id_by_email(text) from public, anon;
grant execute on function public.find_profile_id_by_email(text) to authenticated;
