-- "الـ50 مسوّقًا": a capped (50-seat) platform-wide ambassador program,
-- separate from the per-store product-marketer system above. Each
-- ambassador gets a referral code; a customer who signs up with that code
-- is attributed to them. This migration builds attribution + admin
-- management only -- no commission/payout numbers are invented here since
-- none were specified; add that later once a rate is decided.

create table public.platform_marketers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  referral_code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.platform_marketers enable row level security;

create policy "platform_marketers: self read" on public.platform_marketers
  for select using (profile_id = auth.uid());

create policy "platform_marketers: admin full access" on public.platform_marketers
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- enforce the 50-seat cap at the database level, not just in the UI
create or replace function public.enforce_platform_marketer_cap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.platform_marketers where is_active = true) >= 50 then
    raise exception 'platform marketer cap (50) reached';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_platform_marketer_cap() from public, anon, authenticated;

create trigger platform_marketers_cap
  before insert on public.platform_marketers
  for each row when (new.is_active = true)
  execute function public.enforce_platform_marketer_cap();

-- which ambassador (if any) referred this customer to the platform
alter table public.profiles add column referred_by_marketer_id uuid references public.platform_marketers (id);

-- resolve a referral code at signup time (mirrors handle_new_user's role
-- handling) -- invalid/unknown codes are ignored rather than blocking
-- signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
  requested_referral text := new.raw_user_meta_data ->> 'referral_code';
  v_marketer_id uuid;
begin
  if requested_referral is not null then
    select id into v_marketer_id
    from public.platform_marketers
    where referral_code = requested_referral and is_active = true;
  end if;

  insert into public.profiles (id, full_name, role, referred_by_marketer_id)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    case
      when requested_role = 'seller' then 'seller'::public.user_role
      when requested_role = 'marketer' then 'marketer'::public.user_role
      else 'customer'::public.user_role
    end,
    v_marketer_id
  );
  return new;
end;
$$;
