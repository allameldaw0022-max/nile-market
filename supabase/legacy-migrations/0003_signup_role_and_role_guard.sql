-- Let signup choose "customer" or "seller" via user metadata, and make sure
-- nobody can grant themselves (or escalate to) "admin" -- neither through
-- signup metadata nor through a later self-update of profiles.role.

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
    case when requested_role = 'seller' then 'seller'::public.user_role else 'customer'::public.user_role end
  );
  return new;
end;
$$;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
    ) then
      new.role = old.role;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_profile_role() from public, anon, authenticated;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();
