-- The earlier "store owner can see their marketers' names" policy only
-- matched orders.placed_by_marketer_id (assisted orders). Since
-- order_items.marketer_id is now the single source of truth for
-- attribution on BOTH assisted and affiliate_link orders, match that
-- instead so link-driven marketers show up too.
drop policy "profiles: store owner read their marketers" on public.profiles;

create policy "profiles: store owner read their marketers" on public.profiles
  for select using (
    role = 'marketer'
    and exists (
      select 1 from public.order_items oi
      join public.stores s on s.id = oi.store_id
      where oi.marketer_id = profiles.id and s.owner_id = auth.uid()
    )
  );
