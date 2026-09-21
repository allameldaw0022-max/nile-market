-- A product page (direct link) must not be publicly visible while its
-- store is still pending admin approval or has been suspended -- only the
-- store's own owner (or an admin, via the separate admin policy) should
-- see it before then.
drop policy "products: public read active" on public.products;

create policy "products: public read active" on public.products
  for select using (
    (
      status = 'active'
      and exists (select 1 from public.stores s where s.id = store_id and s.status = 'active')
    )
    or exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  );
