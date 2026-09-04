-- A store owner needs to see (a) the parent `orders` row for any
-- order_item that belongs to their store (previously only the customer,
-- the placing marketer, or an admin could read `orders`), and (b) the
-- full_name of a marketer who has placed at least one order for their
-- store, to render "مسوّقو متجري" (My store's marketers) with real names
-- instead of blank/null joins.

create policy "orders: store owner read via items" on public.orders
  for select using (
    exists (
      select 1 from public.order_items oi
      join public.stores s on s.id = oi.store_id
      where oi.order_id = orders.id and s.owner_id = auth.uid()
    )
  );

create policy "profiles: store owner read their marketers" on public.profiles
  for select using (
    role = 'marketer'
    and exists (
      select 1 from public.orders o
      join public.order_items oi on oi.order_id = o.id
      join public.stores s on s.id = oi.store_id
      where o.placed_by_marketer_id = profiles.id and s.owner_id = auth.uid()
    )
  );
