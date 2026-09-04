-- handle_new_user() sets search_path = 'public' only, but pgcrypto's
-- gen_random_bytes() (used to mint a marketer_code) lives in the
-- 'extensions' schema on this project. Postgres must resolve every
-- function referenced in the INSERT statement at parse time -- including
-- unreached CASE branches -- so this broke every signup (any role), not
-- just marketer ones, with SQLSTATE 42883.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public, extensions
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
