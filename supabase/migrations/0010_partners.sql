-- =====================================================================
-- 0010 Partners · Referral · Commission Ledger · Payouts
--
-- القاعدة المعتمدة: العمولة = 50% من صافي المبلغ المدفوع فعليًا بعد الخصم
-- المثال: 20,000 − 5,000 = 15,000 ⇒ 7,500 للشريك و7,500 للمنصة
-- D19: Last-touch · نافذة 30 يومًا · العلاقة تثبت بعد إنشائها
-- D29/D30: فصل المهام في الصرف بقيد CHECK بلا أي bypass
-- =====================================================================

create type public.partner_status as enum ('invited','active','suspended');

create type public.commission_entry_kind as enum ('commission','reversal');

create type public.commission_status as enum ('payable','paid','reversed');

create type public.payout_status as enum (
  'submitted','pending_review','approved','rejected','paid'
);

create type public.attribution_source as enum ('link','code','admin_manual');

-- ---------------------------------------------------------------------
-- partners
-- ---------------------------------------------------------------------
create table public.partners (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid unique references public.profiles (id) on delete restrict,
  name            text not null,
  email           text not null,
  phone           text,
  status          public.partner_status not null default 'invited',
  referral_code   text not null,
  commission_rate numeric(5,2) not null default 50.00
                    check (commission_rate >= 0 and commission_rate <= 100),
  payout_notes    text,
  invite_token_hash text,
  invited_at      timestamptz,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index partners_code_unique on public.partners (lower(referral_code));
create unique index partners_email_unique on public.partners (lower(email));
create index partners_status_idx on public.partners (status);

create trigger partners_set_updated_at before update on public.partners
  for each row execute function app.set_updated_at();

alter table public.partners enable row level security;

-- النسبة يعدّلها Admin فقط، وتسري على المستقبل فقط
create or replace function app.protect_partner_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.commission_rate is distinct from old.commission_rate
     and not app.has_platform_permission('commissions', 'manage') then
    raise exception 'RATE_PROTECTED: نسبة العمولة يعدّلها Admin بصلاحية commissions:manage فقط'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger partners_protect_rate before update on public.partners
  for each row execute function app.protect_partner_rate();

create or replace function app.current_partner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.partners
  where profile_id = (select auth.uid()) and status = 'active';
$$;

grant execute on function app.current_partner_id() to authenticated;

-- ---------------------------------------------------------------------
-- referral_visits — أثر الزيارات لتطبيق Last-touch (D19) وكشف التلاعب
-- ---------------------------------------------------------------------
create table public.referral_visits (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references public.partners (id) on delete cascade,
  visitor_token text not null,
  landing_path  text,
  ip_hash       text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index referral_visits_token_idx
  on public.referral_visits (visitor_token, created_at desc);
create index referral_visits_partner_idx
  on public.referral_visits (partner_id, created_at desc);

alter table public.referral_visits enable row level security;

-- ---------------------------------------------------------------------
-- referrals — unique(store_id) ⇒ مستحيل نسب متجر لشريكين
-- ---------------------------------------------------------------------
create table public.referrals (
  id                 uuid primary key default gen_random_uuid(),
  partner_id         uuid not null references public.partners (id) on delete restrict,
  store_id           uuid not null unique references public.stores (id) on delete restrict,
  attributed_at      timestamptz not null default now(),
  attribution_source public.attribution_source not null default 'link',
  locked             boolean not null default true,
  created_at         timestamptz not null default now()
);

create index referrals_partner_idx on public.referrals (partner_id);

alter table public.referrals enable row level security;

-- العلاقة ثابتة بعد إنشائها (D19)
create or replace function app.protect_referral()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.locked then
    if new.partner_id is distinct from old.partner_id
       or new.store_id is distinct from old.store_id then
      raise exception 'REFERRAL_LOCKED: علاقة الإحالة ثابتة ولا تتغير'
        using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'REFERRAL_LOCKED: لا تُحذف علاقة الإحالة'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger referrals_protect before update or delete on public.referrals
  for each row execute function app.protect_referral();

-- ربط stores.referred_by_partner_id (FK مؤجّل من 0003)
alter table public.stores
  add constraint stores_partner_fk
  foreign key (referred_by_partner_id) references public.partners (id) on delete set null;

-- ---------------------------------------------------------------------
-- partner_payouts — ★ فصل المهام (D29/D30)
-- ---------------------------------------------------------------------
create table public.partner_payouts (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid not null references public.partners (id) on delete restrict,
  amount            numeric(14,2) not null check (amount > 0),
  currency          char(3) not null default 'SDG',
  method            text,
  reference         text,
  status            public.payout_status not null default 'submitted',
  initiated_by      uuid references public.profiles (id),   -- الشريك نفسه
  initiated_by_kind public.actor_kind,
  requested_by      uuid references public.profiles (id),   -- موظف Admin يسجّل
  approved_by       uuid references public.profiles (id),   -- موظف Admin آخر
  approved_at       timestamptz,
  rejected_reason   text,
  paid_at           timestamptz,
  note              text,
  idempotency_key   text not null unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- ★★ لا bypass — القيد يسري على service_role أيضًا (D29)
  constraint payouts_sod_requester check
    (approved_by is null or approved_by is distinct from requested_by),
  constraint payouts_sod_initiator check
    (approved_by is null or approved_by is distinct from initiated_by)
);

create index partner_payouts_partner_idx on public.partner_payouts (partner_id, created_at desc);
create index partner_payouts_status_idx  on public.partner_payouts (status);

create trigger partner_payouts_set_updated_at before update on public.partner_payouts
  for each row execute function app.set_updated_at();
create trigger partner_payouts_no_delete before delete on public.partner_payouts
  for each row execute function app.block_mutation();

alter table public.partner_payouts enable row level security;

create or replace function app.guard_payout_actors()
returns trigger
language plpgsql
security definer          -- يقرأ admin_members بتجاوز RLS: بدونه يرى المستدعي
set search_path = ''      -- لا شيء فيرفض معتمِدًا صحيحًا
as $$
begin
  if new.requested_by is not null and not exists (
       select 1 from public.admin_members
        where profile_id = new.requested_by and status = 'active') then
    raise exception 'SOD_INVALID_REQUESTER: مسجّل الطلب يجب أن يكون موظف منصة نشطًا'
      using errcode = '42501';
  end if;
  if new.approved_by is not null and not exists (
       select 1 from public.admin_members
        where profile_id = new.approved_by and status = 'active') then
    raise exception 'SOD_INVALID_APPROVER: المعتمِد يجب أن يكون موظف منصة نشطًا'
      using errcode = '42501';
  end if;
  -- طلب الشريك وحده لا يحرّك مالًا (D30)
  if new.approved_by is not null and new.requested_by is null then
    raise exception 'SOD_ORDER: لا اعتماد قبل تسجيل الطلب إداريًا'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger partner_payouts_guard_actors
  before insert or update on public.partner_payouts
  for each row execute function app.guard_payout_actors();

-- ---------------------------------------------------------------------
-- commission_ledger — إلحاقي
-- ★ unique(payment_id) للعمولات ⇒ استحالة بنيوية للاحتساب المزدوج
-- ---------------------------------------------------------------------
create table public.commission_ledger (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references public.partners (id) on delete restrict,
  store_id        uuid not null references public.stores (id) on delete restrict,
  referral_id     uuid references public.referrals (id) on delete restrict,
  payment_id      uuid references public.payments (id) on delete restrict,
  subscription_id uuid references public.subscriptions (id) on delete restrict,
  entry_kind      public.commission_entry_kind not null default 'commission',
  base_amount     numeric(14,2) not null check (base_amount >= 0),
  rate_applied    numeric(5,2) not null check (rate_applied >= 0 and rate_applied <= 100),
  amount          numeric(14,2) not null,
  currency        char(3) not null default 'SDG',
  reverses_id     uuid references public.commission_ledger (id),
  refund_id       uuid references public.refunds (id) on delete restrict,
  status          public.commission_status not null default 'payable',
  payout_id       uuid references public.partner_payouts (id) on delete restrict,
  created_at      timestamptz not null default now(),
  constraint commission_sign check (
    (entry_kind = 'commission' and amount >= 0) or
    (entry_kind = 'reversal'   and amount <= 0)
  )
);

-- ★★ الحاجز البنيوي ضد العمولة المكررة
create unique index commission_once_per_payment
  on public.commission_ledger (payment_id)
  where entry_kind = 'commission' and payment_id is not null;

create index commission_partner_idx on public.commission_ledger (partner_id, created_at desc);
create index commission_store_idx   on public.commission_ledger (store_id);
create index commission_payout_idx  on public.commission_ledger (payout_id);
create index commission_payable_idx on public.commission_ledger (partner_id)
  where status = 'payable';

alter table public.commission_ledger force row level security;
create trigger commission_no_update before update on public.commission_ledger
  for each row execute function app.block_mutation();
create trigger commission_no_delete before delete on public.commission_ledger
  for each row execute function app.block_mutation();

alter table public.commission_ledger enable row level security;

-- ربط ledger_entries (FKs مؤجّلة من 0009)
alter table public.ledger_entries
  add constraint ledger_commission_fk
  foreign key (commission_id) references public.commission_ledger (id) on delete restrict;
alter table public.ledger_entries
  add constraint ledger_payout_fk
  foreign key (payout_id) references public.partner_payouts (id) on delete restrict;

-- =====================================================================
-- ★ احتساب العمولة — من القاعدة، على المدفوع فعليًا
-- =====================================================================
create or replace function app.post_commission_for_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_ref     public.referrals%rowtype;
  v_partner public.partners%rowtype;
  v_amount  numeric(14,2);
  v_id      uuid;
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if not found or v_payment.status <> 'paid' then
    return null;                       -- لا دفع ⇒ لا عمولة
  end if;
  if v_payment.kind <> 'subscription' then
    return null;                       -- V1: العمولة على الاشتراكات فقط (D13)
  end if;

  select * into v_ref from public.referrals where store_id = v_payment.store_id;
  if not found then return null; end if;

  select * into v_partner from public.partners where id = v_ref.partner_id;
  if not found or v_partner.status <> 'active' then return null; end if;

  -- الأساس: المبلغ المدفوع فعليًا بعد الخصم — يُقرأ من payments لا من الواجهة
  v_amount := app.money(v_payment.amount * v_partner.commission_rate / 100);
  if v_amount <= 0 then return null; end if;

  begin
    insert into public.commission_ledger
      (partner_id, store_id, referral_id, payment_id, subscription_id,
       entry_kind, base_amount, rate_applied, amount, status)
    values (v_partner.id, v_payment.store_id, v_ref.id, p_payment_id,
            v_payment.subscription_id, 'commission',
            v_payment.amount, v_partner.commission_rate, v_amount, 'payable')
    returning id into v_id;
  exception when unique_violation then
    -- الحاجز البنيوي أمسك محاولة احتساب ثانية لنفس الدفعة
    return null;
  end;

  insert into public.ledger_entries
    (account_kind, account_id, entry_type, direction, amount, payment_id,
     subscription_id, commission_id, memo)
  values ('platform', null, 'partner_commission', 'debit', v_amount,
          p_payment_id, v_payment.subscription_id, v_id, 'عمولة شريك');

  insert into public.ledger_entries
    (account_kind, account_id, entry_type, direction, amount, payment_id,
     subscription_id, commission_id, memo)
  values ('partner', v_partner.id, 'partner_commission', 'credit', v_amount,
          p_payment_id, v_payment.subscription_id, v_id, 'عمولة شريك');

  return v_id;
end;
$$;

-- =====================================================================
-- عكس العمولة عند الاسترداد — بقيد جديد، ولا يُمسّ الأصل
-- =====================================================================
create or replace function app.reverse_commission(p_refund_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund  public.refunds%rowtype;
  v_orig    public.commission_ledger%rowtype;
  v_payment public.payments%rowtype;
  v_ratio   numeric;
  v_amount  numeric(14,2);
  v_id      uuid;
begin
  select * into v_refund from public.refunds where id = p_refund_id;
  if not found then return null; end if;

  select * into v_orig from public.commission_ledger
   where payment_id = v_refund.payment_id and entry_kind = 'commission';
  if not found then return null; end if;          -- لا عمولة أصلًا

  select * into v_payment from public.payments where id = v_refund.payment_id;
  if v_payment.amount = 0 then return null; end if;

  v_ratio  := v_refund.amount / v_payment.amount;          -- كامل ⇒ 1
  v_amount := app.money(v_orig.amount * v_ratio);
  if v_amount <= 0 then return null; end if;

  insert into public.commission_ledger
    (partner_id, store_id, referral_id, payment_id, subscription_id, entry_kind,
     base_amount, rate_applied, amount, reverses_id, refund_id, status)
  values (v_orig.partner_id, v_orig.store_id, v_orig.referral_id, null,
          v_orig.subscription_id, 'reversal', v_refund.amount, v_orig.rate_applied,
          -v_amount, v_orig.id, p_refund_id, 'reversed')
  returning id into v_id;

  insert into public.ledger_entries
    (account_kind, account_id, entry_type, direction, amount, refund_id,
     commission_id, reverses_entry_id, memo)
  values ('partner', v_orig.partner_id, 'commission_reversal', 'debit', v_amount,
          p_refund_id, v_id, null, 'عكس عمولة بسبب استرداد');

  insert into public.ledger_entries
    (account_kind, account_id, entry_type, direction, amount, refund_id,
     commission_id, memo)
  values ('platform', null, 'commission_reversal', 'credit', v_amount,
          p_refund_id, v_id, 'عكس عمولة بسبب استرداد');

  return v_id;
end;
$$;

-- =====================================================================
-- إسناد الإحالة — Last-touch داخل نافذة 30 يومًا (D19)
-- =====================================================================
create or replace function app.attribute_referral(
  p_store_id uuid, p_visitor_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_partner uuid; v_ref uuid;
begin
  if p_visitor_token is null or trim(p_visitor_token) = '' then return null; end if;
  if exists (select 1 from public.referrals where store_id = p_store_id) then
    return null;                                   -- العلاقة ثابتة بعد إنشائها
  end if;

  -- Last-touch: آخر زيارة داخل النافذة
  select rv.partner_id into v_partner
    from public.referral_visits rv
    join public.partners p on p.id = rv.partner_id and p.status = 'active'
   where rv.visitor_token = p_visitor_token
     and rv.created_at >= now() - interval '30 days'
   order by rv.created_at desc
   limit 1;

  if v_partner is null then return null; end if;

  -- منع الإسناد الذاتي: شريك يحيل متجرًا يملكه
  if exists (
      select 1 from public.partners pt
      join public.stores s on s.owner_id = pt.profile_id
      where pt.id = v_partner and s.id = p_store_id) then
    return null;
  end if;

  insert into public.referrals (partner_id, store_id, attribution_source)
  values (v_partner, p_store_id, 'link')
  on conflict (store_id) do nothing
  returning id into v_ref;

  if v_ref is not null then
    update public.stores set referred_by_partner_id = v_partner where id = p_store_id;
  end if;
  return v_ref;
end;
$$;

-- =====================================================================
-- صرف المستحقات — الذرّية تمنع الصرف المزدوج
-- =====================================================================
create or replace function public.mark_payout_paid(
  p_payout_id uuid, p_reference text default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.partner_payouts%rowtype;
  v_linked numeric(14,2) := 0;
  v_row record;
  v_remaining numeric(14,2);
begin
  if not app.has_platform_permission('payouts', 'approve') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_payout from public.partner_payouts where id = p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_payout.status = 'paid' then
    raise exception 'PAYOUT_ALREADY_PAID' using errcode = 'P0001';
  end if;
  if v_payout.status <> 'approved' then
    raise exception 'PAYOUT_NOT_APPROVED: لا يُصرف قبل الاعتماد' using errcode = 'P0001';
  end if;

  v_remaining := v_payout.amount;

  -- يربط صفوف العمولة القابلة للصرف بهذا الصرف داخل نفس المعاملة.
  -- صف مرتبط بـpayout_id لا يُلتقط مرة أخرى ⇒ لا صرف مزدوج.
  for v_row in
    select id, amount from public.commission_ledger
     where partner_id = v_payout.partner_id
       and status = 'payable'
       and payout_id is null
       and amount > 0
     order by created_at
     for update
  loop
    exit when v_remaining <= 0;
    perform set_config('app.commission_write', 'on', true);
    update public.commission_ledger
       set status = 'paid', payout_id = p_payout_id
     where id = v_row.id;
    perform set_config('app.commission_write', 'off', true);
    v_linked := v_linked + v_row.amount;
    v_remaining := v_remaining - v_row.amount;
  end loop;

  update public.partner_payouts
     set status = 'paid', paid_at = now(), reference = coalesce(p_reference, reference)
   where id = p_payout_id;

  insert into public.ledger_entries
    (account_kind, account_id, entry_type, direction, amount, payout_id, memo, created_by)
  values ('partner', v_payout.partner_id, 'partner_payout', 'debit',
          v_payout.amount, p_payout_id, 'صرف مستحقات شريك', (select auth.uid()));

  return v_linked;
end;
$$;

-- استثناء لحارس الإلحاق: ربط الصرف تغيير مسموح ومحصور
create or replace function app.block_mutation_commission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.commission_write', true), '') = 'on'
     and new.partner_id = old.partner_id
     and new.amount     = old.amount
     and new.base_amount = old.base_amount
     and new.rate_applied = old.rate_applied
     and new.entry_kind = old.entry_kind
     and new.payment_id is not distinct from old.payment_id then
    return new;             -- ربط payout فقط، بلا مساس بأي رقم
  end if;
  raise exception 'APPEND_ONLY: commission_ledger لا يقبل التعديل أو الحذف'
    using errcode = '42501';
end;
$$;

drop trigger commission_no_update on public.commission_ledger;
create trigger commission_no_update before update on public.commission_ledger
  for each row execute function app.block_mutation_commission();

revoke execute on function public.mark_payout_paid(uuid, text) from public, anon;
grant   execute on function public.mark_payout_paid(uuid, text) to authenticated;

-- رصيد الشريك
create view public.partner_balances
with (security_invoker = true) as
  select p.id as partner_id,
         coalesce(sum(cl.amount) filter (where cl.status = 'payable'), 0) as payable,
         coalesce(sum(cl.amount) filter (where cl.status = 'paid'), 0)    as paid,
         coalesce(sum(cl.amount), 0)                                     as total
  from public.partners p
  left join public.commission_ledger cl on cl.partner_id = p.id
  group by p.id;

-- =====================================================================
-- RLS
-- =====================================================================
create policy partners_self_read on public.partners
  for select to authenticated using (profile_id = (select auth.uid()));

create policy partners_platform_read on public.partners
  for select to authenticated
  using (app.has_platform_permission('partners', 'view'));

create policy partners_platform_write on public.partners
  for all to authenticated
  using (app.has_platform_permission('partners', 'edit'))
  with check (app.has_platform_permission('partners', 'edit'));

create policy referrals_partner_read on public.referrals
  for select to authenticated using (partner_id = app.current_partner_id());

create policy referrals_store_read on public.referrals
  for select to authenticated using (app.is_store_owner(store_id));

create policy referrals_platform_read on public.referrals
  for select to authenticated
  using (app.has_platform_permission('partners', 'view'));

create policy referral_visits_platform_read on public.referral_visits
  for select to authenticated
  using (app.has_platform_permission('partners', 'view'));

create policy commission_partner_read on public.commission_ledger
  for select to authenticated using (partner_id = app.current_partner_id());

create policy commission_platform_read on public.commission_ledger
  for select to authenticated
  using (app.has_platform_permission('commissions', 'view'));

create policy payouts_partner_read on public.partner_payouts
  for select to authenticated using (partner_id = app.current_partner_id());

create policy payouts_partner_request on public.partner_payouts
  for insert to authenticated
  with check (partner_id = app.current_partner_id()
              and status = 'submitted'
              and requested_by is null and approved_by is null);

create policy payouts_platform_read on public.partner_payouts
  for select to authenticated
  using (app.has_platform_permission('payouts', 'view'));

create policy payouts_platform_write on public.partner_payouts
  for all to authenticated
  using (app.has_platform_permission('payouts', 'approve'))
  with check (app.has_platform_permission('payouts', 'approve'));

-- =====================================================================
-- المنح
-- =====================================================================
grant select, insert, update on public.partners to authenticated;
grant select on public.referrals        to authenticated;
grant select on public.referral_visits  to authenticated;
grant select on public.commission_ledger to authenticated;
grant select on public.partner_balances  to authenticated;
grant select, insert, update on public.partner_payouts to authenticated;
revoke insert, update, delete on public.commission_ledger from anon, authenticated;
revoke delete on public.partner_payouts from anon, authenticated;
revoke delete on public.referrals from anon, authenticated;
