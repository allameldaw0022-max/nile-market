-- Product view counting: kept for internal stats only, never surfaced to
-- customers (see product page). Regular customers have no UPDATE right on
-- products (only the store owner/admin do), so a narrow SECURITY DEFINER
-- function is the only way to let a viewer's visit increment the counter
-- without granting them general write access to the row.
create or replace function public.increment_product_views(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products set views_count = views_count + 1 where id = p_product_id;
end;
$$;

revoke execute on function public.increment_product_views(uuid) from public;
grant execute on function public.increment_product_views(uuid) to anon, authenticated;
