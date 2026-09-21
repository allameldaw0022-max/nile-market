-- =====================================================================
-- 0009 Payments · Refunds · Financial Ledger · Invoices
--
-- D20: لا Bankak API — تحويل وإثبات يدوي، وبنية تقبل Adapter لاحقًا
-- D23/D29/D30: فصل المهام بقيد CHECK يسري على **كل** الأدوار بما فيها
--              service_role (تجاوز RLS لا يتجاوز القيود)
-- المواصفات §14: Payment منفصل عن Order · Idempotency · لا حذف
-- =====================================================================

create type public.payment_kind as enum ('order','subscription');

create type public.payment_status as enum (
  'pending','paid','failed','refunded','partially_refunded'
);

create type public.refund_status as enum (
  'submitted','pending_review','approved','rejected','completed'
);

create type public.ledger_account as enum ('platform','store','partner');

create type public.ledger_direction as enum ('credit','debit');

create type public.ledger_entry_type as enum (
  'subscription_revenue','partner_commission','commission_reversal',
  'partner_payout','refund','adjustment'
);

-- ---------------------------------------------------------------------
-- payments — منفصل عن الطلب، ويخدم الطلبات والاشتراكات
-- ---------------------------------------------------------------------
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  kind              public.payment_kind not null,
  store_id          uuid references public.stores (id) on delete restrict,
  order_id          uuid references public.orders (id) on delete restrict,
  subscription_id   uuid references public.subscriptions (id) on delete restrict,
  method            public.payment_method not null,
  status            public.payment_status not null default 'pending',
  amount            numeric(14,2) not null check (amount > 0),
  currency          char(3) not null default 'SDG',
  reference         text,
  proof_media_id    uuid references public.media_files (id) on delete set null,
  paid_at           timestamptz,
  failed_reason     text,
  confirmed_by      uuid references public.profiles (id),
  confirmed_at      timestamptz,
  idempotency_key   text not null,
  external_event_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint payments_target_matches_kind check (
    (kind = 'order'        and order_id is not null and subscription_id is null)
 or (kind = 'subscription' and subscription_id is not null and order_id is null)
  )
);

create unique index payments_idempotency_unique on public.payments (kind, idempotency_key);
create unique index payments_external_event_unique
  on public.payments (external_event_id) where external_event_id is not null;
create index payments_store_idx on public.payments (store_id, created_at desc);
create index payments_order_idx on public.payments (order_id);
create index payments_status_idx on public.payments (status);

create trigger payments_set_updated_at before update on public.payments
  for each row execute function app.set_updated_at();

alter table public.payments enable row level security;

-- المبلغ والحالة لا يُعدَّلان بعد التأكيد
create or replace function app.protect_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'paid' then
    if new.amount is distinct from old.amount then
      raise exception 'PAYMENT_IMMUTABLE: لا يُعدَّل مبلغ دفعة مؤكَّدة'
        using errcode = '42501';
    end if;
    if new.status = 'pending' then
      raise exception 'PAYMENT_NO_REVERT: دفعة مؤكَّدة لا تعود معلّقة'
        using errcode = '42501';
    end if;
  end if;
  new.kind := old.kind;
  new.idempotency_key := old.idempotency_key;
  return new;
end;
$$;

create trigger payments_protect before update on public.payments
  for each row execute function app.protect_payment();

create trigger payments_no_delete before delete on public.payments
  for each row execute function app.block_mutation();

-- ---------------------------------------------------------------------
-- payment_events — إلحاقي
-- ---------------------------------------------------------------------
create table public.payment_events (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  event      text not null,
  from_status public.payment_status,
  to_status   public.payment_status,
  actor_id   uuid references public.profiles (id) on delete set null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index payment_events_payment_idx on public.payment_events (payment_id, created_at);

create trigger payment_events_no_update before update on public.payment_events
  for each row execute function app.block_mutation();
create trigger payment_events_no_delete before delete on public.payment_events
  for each row execute function app.block_mutation();

alter table public.payment_events enable row level security;

-- ---------------------------------------------------------------------
-- refunds — ★ فصل المهام بقيد CHECK (D29/D30)
-- ---------------------------------------------------------------------
create table public.refunds (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid not null references public.payments (id) on delete restrict,
  store_id          uuid references public.stores (id) on delete restrict,
  order_id          uuid references public.orders (id) on delete restrict,
  subscription_id   uuid references public.subscriptions (id) on delete restrict,
  amount            numeric(14,2) not null check (amount > 0),
  reason            text not null check (length(trim(reason)) >= 3),
  status            public.refund_status not null default 'submitted',
  initiated_by      uuid references public.profiles (id),      -- العميل/التاجر
  initiated_by_kind public.actor_kind,
  requested_by      uuid references public.profiles (id),      -- موظف Admin يسجّل
  approved_by       uuid references public.profiles (id),      -- موظف Admin آخر
  approved_at       timestamptz,
  rejected_reason   text,
  completed_at      timestamptz,
  idempotency_key   text not null unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- ★★ فصل المهام — يُفرض على كل الأدوار بما فيها service_role.
  -- تجاوز RLS لا يتجاوز القيود، فهذه هي الآلية الوحيدة التي تحقق
  -- «لا bypass» حرفيًا (D29).
  constraint refunds_sod_requester check
    (approved_by is null or approved_by is distinct from requested_by),
  constraint refunds_sod_initiator check
    (approved_by is null or approved_by is distinct from initiated_by)
);

create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_status_idx  on public.refunds (status);

create trigger refunds_set_updated_at before update on public.refunds
  for each row execute function app.set_updated_at();
create trigger refunds_no_delete before delete on public.refunds
  for each row execute function app.block_mutation();

alter table public.refunds enable row level security;

-- مجموع الاستردادات لا يتجاوز مبلغ الدفعة
create or replace function app.guard_refund_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_paid numeric(14,2); v_refunded numeric(14,2);
begin
  select amount into v_paid from public.payments where id = new.payment_id;
  select coalesce(sum(amount), 0) into v_refunded
    from public.refunds
   where payment_id = new.payment_id
     and status in ('approved','completed')
     and id <> new.id;
  if v_refunded + new.amount > v_paid then
    raise exception 'REFUND_EXCEEDS_PAYMENT: مجموع الاستردادات يتجاوز مبلغ الدفعة'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger refunds_guard_amount before insert or update on public.refunds
  for each row execute function app.guard_refund_amount();

-- الطرفان يجب أن يكونا موظفي Admin نشطين (CHECK لا يقبل استعلامًا فرعيًا)
create or replace function app.guard_refund_actors()
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
  if new.approved_by is not null and new.requested_by is null then
    raise exception 'SOD_ORDER: لا اعتماد قبل تسجيل الطلب إداريًا'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger refunds_guard_actors before insert or update on public.refunds
  for each row execute function app.guard_refund_actors();

-- ---------------------------------------------------------------------
-- ledger_entries — إلحاقي، قلب النظام المالي
-- ---------------------------------------------------------------------
create table public.ledger_entries (
  id                uuid primary key default gen_random_uuid(),
  account_kind      public.ledger_account not null,
  account_id        uuid,
  entry_type        public.ledger_entry_type not null,
  direction         public.ledger_direction not null,
  amount            numeric(14,2) not null check (amount > 0),
  currency          char(3) not null default 'SDG',
  payment_id        uuid references public.payments (id) on delete restrict,
  refund_id         uuid references public.refunds (id) on delete restrict,
  subscription_id   uuid references public.subscriptions (id) on delete restrict,
  commission_id     uuid,                      -- FK في 0010
  payout_id         uuid,                      -- FK في 0010
  reverses_entry_id uuid references public.ledger_entries (id),
  memo              text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index ledger_account_idx
  on public.ledger_entries (account_kind, account_id, created_at desc);
create index ledger_payment_idx on public.ledger_entries (payment_id);

-- ★ إلحاقي بالمطلق
alter table public.ledger_entries force row level security;
create trigger ledger_no_update before update on public.ledger_entries
  for each row execute function app.block_mutation();
create trigger ledger_no_delete before delete on public.ledger_entries
  for each row execute function app.block_mutation();

alter table public.ledger_entries enable row level security;

-- عرض الأرصدة: الرصيد مشتق دائمًا، ولا يوجد عمود قابل للانحراف
create view public.ledger_balances
with (security_invoker = true) as
  select account_kind, account_id, currency,
         sum(case when direction = 'credit' then amount else -amount end) as balance
  from public.ledger_entries
  group by account_kind, account_id, currency;

-- ---------------------------------------------------------------------
-- invoices — لقطة لا تتغير مهما تغيّرت الجداول لاحقًا
-- ---------------------------------------------------------------------
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid references public.stores (id) on delete restrict,
  order_id        uuid references public.orders (id) on delete restrict,
  subscription_id uuid references public.subscriptions (id) on delete restrict,
  payment_id      uuid references public.payments (id) on delete restrict,
  invoice_number  text not null unique,
  issued_at       timestamptz not null default now(),
  total           numeric(14,2) not null check (total >= 0),
  currency        char(3) not null default 'SDG',
  snapshot        jsonb not null
);

create index invoices_store_idx on public.invoices (store_id, issued_at desc);
create index invoices_order_idx on public.invoices (order_id);

create trigger invoices_no_update before update on public.invoices
  for each row execute function app.block_mutation();
create trigger invoices_no_delete before delete on public.invoices
  for each row execute function app.block_mutation();

alter table public.invoices enable row level security;

-- ربط subscription_events بالدفعة (FK مؤجّل من 0007)
alter table public.subscription_events
  add constraint subscription_events_payment_fk
  foreign key (payment_id) references public.payments (id) on delete set null;

-- =====================================================================
-- تحديث مجاميع الطلب من الدفعات — مشتقة، لا تُكتب يدويًا
-- =====================================================================
create or replace function app.refresh_order_payment_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_paid numeric(14,2);
  v_refunded numeric(14,2);
  v_total numeric(14,2);
  v_status public.order_payment_status;
begin
  if v_order_id is null then return coalesce(new, old); end if;

  select coalesce(sum(amount), 0) into v_paid
    from public.payments where order_id = v_order_id and status = 'paid';
  select coalesce(sum(r.amount), 0) into v_refunded
    from public.refunds r join public.payments p on p.id = r.payment_id
   where p.order_id = v_order_id and r.status = 'completed';
  select total into v_total from public.orders where id = v_order_id;

  v_status := case
    when v_refunded > 0 and v_refunded >= v_paid then 'refunded'
    when v_refunded > 0                          then 'partially_refunded'
    when v_paid >= v_total and v_total > 0       then 'paid'
    when v_paid > 0                              then 'partially_paid'
    when exists (select 1 from public.payments
                  where order_id = v_order_id and status = 'pending') then 'pending'
    else 'unpaid'
  end;

  perform set_config('app.financial_write', 'on', true);
  update public.orders
     set paid_total = v_paid, refunded_total = v_refunded, payment_status = v_status
   where id = v_order_id;
  perform set_config('app.financial_write', 'off', true);

  return coalesce(new, old);
end;
$$;

create trigger payments_refresh_order after insert or update on public.payments
  for each row execute function app.refresh_order_payment_totals();

-- =====================================================================
-- record_payment — تأكيد دفعة داخل معاملة واحدة
-- =====================================================================
create or replace function public.record_payment(
  p_kind            public.payment_kind,
  p_target_id       uuid,           -- order_id أو subscription_request_id
  p_method          public.payment_method,
  p_amount          numeric,
  p_reference       text default null,
  p_proof_media_id  uuid default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := coalesce(nullif(trim(p_idempotency_key), ''), app.random_token(16));
  v_existing uuid;
  v_payment_id uuid;
  v_store_id uuid;
  v_order public.orders%rowtype;
  v_req public.subscription_requests%rowtype;
  v_sub public.subscriptions%rowtype;
  v_plan public.plans%rowtype;
begin
  select id into v_existing from public.payments
   where kind = p_kind and idempotency_key = v_key;
  if found then return v_existing; end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  if p_kind = 'order' then
    select * into v_order from public.orders where id = p_target_id for update;
    if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
    if not app.has_store_permission(v_order.store_id, 'orders:payment')
       and not app.has_platform_permission('payments', 'approve') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    v_store_id := v_order.store_id;

    insert into public.payments
      (kind, store_id, order_id, method, status, amount, reference,
       proof_media_id, paid_at, confirmed_by, confirmed_at, idempotency_key)
    values ('order', v_store_id, v_order.id, p_method, 'paid', app.money(p_amount),
            p_reference, p_proof_media_id, now(), (select auth.uid()), now(), v_key)
    returning id into v_payment_id;

  else
    -- اشتراك: يُعتمد من موظف منصة بصلاحية subscriptions:approve
    if not app.has_platform_permission('subscriptions', 'approve') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    select * into v_req from public.subscription_requests where id = p_target_id for update;
    if not found then raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_req.status <> 'pending' then
      raise exception 'REQUEST_ALREADY_REVIEWED' using errcode = 'P0001';
    end if;

    v_store_id := v_req.store_id;
    v_sub := app.store_subscription(v_store_id);
    select * into v_plan from public.plans where id = v_req.plan_id;

    insert into public.payments
      (kind, store_id, subscription_id, method, status, amount, reference,
       proof_media_id, paid_at, confirmed_by, confirmed_at, idempotency_key)
    values ('subscription', v_store_id, v_sub.id, p_method, 'paid', app.money(p_amount),
            p_reference, coalesce(p_proof_media_id, v_req.proof_media_id),
            now(), (select auth.uid()), now(), v_key)
    returning id into v_payment_id;

    -- تفعيل/تمديد الاشتراك (D17: تمديد بسيط، لا تناسب زمني)
    update public.subscriptions
       set plan_id            = v_req.plan_id,
           previous_plan_id   = case when plan_id <> v_req.plan_id then plan_id else previous_plan_id end,
           status             = 'active',
           started_at         = case when status in ('expired','cancelled','suspended')
                                     then now() else started_at end,
           current_period_end = greatest(coalesce(current_period_end, now()), now())
                                + make_interval(days => v_plan.duration_days),
           grace_ends_at      = null,
           expiring_warned_at = null
     where id = v_sub.id;

    update public.subscription_requests
       set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
     where id = v_req.id;

    insert into public.subscription_events
      (subscription_id, store_id, event, from_plan_id, to_plan_id, payment_id, actor_id)
    values (v_sub.id, v_store_id,
            (case when v_sub.plan_id = v_req.plan_id then 'renewed'
                  when v_plan.price > (select price from public.plans where id = v_sub.plan_id)
                  then 'upgraded' else 'downgraded'
             end)::public.subscription_event_kind,
            v_sub.plan_id, v_req.plan_id, v_payment_id, (select auth.uid()));

    -- إيراد المنصة
    insert into public.ledger_entries
      (account_kind, account_id, entry_type, direction, amount, payment_id,
       subscription_id, memo, created_by)
    values ('platform', null, 'subscription_revenue', 'credit', app.money(p_amount),
            v_payment_id, v_sub.id, 'إيراد اشتراك', (select auth.uid()));

    -- عمولة الشريك إن وُجد (تُعرَّف في 0010)
    perform app.post_commission_for_payment(v_payment_id);
  end if;

  insert into public.payment_events (payment_id, event, to_status, actor_id)
  values (v_payment_id, 'recorded', 'paid', (select auth.uid()));

  return v_payment_id;
end;
$$;

revoke execute on function public.record_payment(public.payment_kind, uuid,
  public.payment_method, numeric, text, uuid, text) from public, anon;
grant execute on function public.record_payment(public.payment_kind, uuid,
  public.payment_method, numeric, text, uuid, text) to authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
create policy payments_store_read on public.payments
  for select to authenticated
  using (store_id is not null and app.has_store_permission(store_id, 'orders:payment'));

create policy payments_platform_read on public.payments
  for select to authenticated
  using (app.has_platform_permission('payments', 'view'));

create policy payments_platform_write on public.payments
  for update to authenticated
  using (app.has_platform_permission('payments', 'approve'))
  with check (app.has_platform_permission('payments', 'approve'));

create policy payment_events_read on public.payment_events
  for select to authenticated
  using (app.has_platform_permission('payments', 'view')
         or exists (select 1 from public.payments p
                    where p.id = payment_id and p.store_id is not null
                      and app.has_store_permission(p.store_id, 'orders:payment')));

create policy refunds_platform_read on public.refunds
  for select to authenticated
  using (app.has_platform_permission('payments', 'view'));

create policy refunds_store_read on public.refunds
  for select to authenticated
  using (store_id is not null and app.has_store_permission(store_id, 'orders:payment'));

create policy refunds_platform_write on public.refunds
  for all to authenticated
  using (app.has_platform_permission('payments', 'approve'))
  with check (app.has_platform_permission('payments', 'approve'));

create policy ledger_platform_read on public.ledger_entries
  for select to authenticated
  using (app.has_platform_permission('payments', 'view'));

create policy ledger_store_read on public.ledger_entries
  for select to authenticated
  using (account_kind = 'store' and account_id is not null
         and app.has_store_permission(account_id, 'subscription:manage'));

create policy invoices_store_read on public.invoices
  for select to authenticated
  using (store_id is not null and app.is_store_member(store_id));

create policy invoices_platform_read on public.invoices
  for select to authenticated
  using (app.has_platform_permission('payments', 'view'));

-- =====================================================================
-- المنح — لا INSERT/UPDATE/DELETE على الجداول الإلحاقية لأي دور
-- =====================================================================
grant select, update on public.payments to authenticated;
grant select on public.payment_events   to authenticated;
grant select, insert, update on public.refunds to authenticated;
grant select on public.ledger_entries   to authenticated;
grant select on public.ledger_balances  to authenticated;
grant select on public.invoices         to authenticated;
revoke insert, update, delete on public.ledger_entries from anon, authenticated;
revoke insert, update, delete on public.invoices       from anon, authenticated;
revoke delete on public.payments from anon, authenticated;
revoke delete on public.refunds  from anon, authenticated;
