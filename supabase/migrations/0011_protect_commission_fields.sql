-- A store owner's broad "manage my store's order_items" policy is
-- row-level, so without this it could also let them directly UPDATE
-- commission_amount/commission_paid (e.g. mark a commission "paid" to
-- avoid paying a marketer). Only admin (via mark_withdrawal_paid, or
-- directly) may change these two columns; everyone else's changes to them
-- are silently reverted, leaving their other column changes (status, etc.)
-- untouched.
create or replace function public.protect_commission_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.commission_amount is distinct from old.commission_amount)
     or (new.commission_paid is distinct from old.commission_paid) then
    if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
      new.commission_amount = old.commission_amount;
      new.commission_paid = old.commission_paid;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_commission_fields() from public, anon, authenticated;

create trigger order_items_protect_commission
  before update on public.order_items
  for each row execute function public.protect_commission_fields();
