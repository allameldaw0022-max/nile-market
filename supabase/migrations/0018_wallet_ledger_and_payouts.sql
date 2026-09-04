-- Wallet / Ledger: the real financial source of truth. Every credit
-- (seller earning, marketer commission, platform revenue) and debit
-- (withdrawal paid) is an explicit row here, posted server-side only --
-- a wallet's balance is simply sum(amount) for its rows. This replaces
-- the previous "sum unpaid delivered commission_amount" live computation,
-- which had no way to reverse a commission if a delivered item was later
-- cancelled/refunded.

create type public.wallet_owner_type as enum ('seller', 'marketer', 'platform');
create type public.ledger_entry_type as enum (
  'seller_earning', 'marketer_commission', 'platform_revenue', 'withdrawal_paid'
);

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_type public.wallet_owner_type not null,
  owner_id uuid, -- store id for seller wallets, profile id for marketer wallets, null for the platform wallet
  entry_type public.ledger_entry_type not null,
  amount numeric(12, 2) not null, -- positive = credit, negative = debit
  order_item_id uuid references public.order_items(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index idx_wallet_ledger_owner on public.wallet_ledger (owner_type, owner_id);

alter table public.wallet_ledger enable row level security;

create policy "wallet_ledger: seller read own" on public.wallet_ledger
  for select using (
    owner_type = 'seller'
    and exists (select 1 from public.stores s where s.id = wallet_ledger.owner_id and s.owner_id = auth.uid())
  );

create policy "wallet_ledger: marketer read own" on public.wallet_ledger
  for select using (owner_type = 'marketer' and owner_id = auth.uid());

create policy "wallet_ledger: admin read all" on public.wallet_ledger
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- No insert/update/delete policy for any role -- rows are only ever
-- written by the SECURITY DEFINER functions below (which run as the
-- table owner and so bypass RLS), never directly by a client.

-- Posts earnings exactly once when an order_item transitions into
-- 'delivered' (commission is only ever earned after successful
-- delivery, per spec), and reverses the net posted amount if a
-- delivered item is later cancelled (refund/return). Reversal nets the
-- *current* balance for that item rather than replaying history, so it
-- stays correct even if an item bounces between delivered/cancelled
-- more than once.
create or replace function public.post_order_item_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    insert into public.wallet_ledger (owner_type, owner_id, entry_type, amount, order_item_id, note)
    values (
      'seller', new.store_id, 'seller_earning',
      new.unit_price * new.quantity - new.commission_amount - new.platform_commission_amount,
      new.id, 'أرباح عنصر طلب'
    );

    if new.marketer_id is not null and new.commission_amount > 0 then
      insert into public.wallet_ledger (owner_type, owner_id, entry_type, amount, order_item_id, note)
      values ('marketer', new.marketer_id, 'marketer_commission', new.commission_amount, new.id, 'عمولة تسويق');
    end if;

    if new.platform_commission_amount > 0 then
      insert into public.wallet_ledger (owner_type, owner_id, entry_type, amount, order_item_id, note)
      values ('platform', null, 'platform_revenue', new.platform_commission_amount, new.id, 'عمولة المنصة');
    end if;
  end if;

  if old.status = 'delivered' and new.status = 'cancelled' then
    insert into public.wallet_ledger (owner_type, owner_id, entry_type, amount, order_item_id, note)
    select owner_type, owner_id, entry_type, -sum(amount), order_item_id, 'إلغاء بعد التسليم — عكس القيد'
    from public.wallet_ledger
    where order_item_id = new.id
    group by owner_type, owner_id, entry_type, order_item_id
    having sum(amount) <> 0;
  end if;

  return new;
end;
$$;

create trigger trg_post_order_item_ledger
after update on public.order_items
for each row execute function public.post_order_item_ledger();

-- Unified payout system -----------------------------------------------

create table public.payout_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instructions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.payout_methods enable row level security;

create policy "payout_methods: admin full access" on public.payout_methods
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "payout_methods: read active" on public.payout_methods
  for select using (is_active);

insert into public.payout_methods (name, instructions) values
  ('تحويل بنكي', 'أدخل اسم البنك ورقم الحساب'),
  ('زين كاش', 'أدخل رقم الهاتف المسجّل في زين كاش'),
  ('MTN موبايل موني', 'أدخل رقم الهاتف المسجّل في MTN موبايل موني');

-- Replaces marketer_withdrawal_requests (empty table, no data to
-- migrate) with a single withdrawal_requests table shared by both
-- sellers and marketers, keyed by owner_type/owner_id like the ledger.
drop table public.marketer_withdrawal_requests;

create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  owner_type public.wallet_owner_type not null,
  owner_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  payout_method_id uuid references public.payout_methods(id),
  payout_details text,
  status public.withdrawal_status not null default 'pending',
  payment_reference text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint withdrawal_requests_owner_type_check check (owner_type in ('seller', 'marketer'))
);

create index idx_withdrawal_requests_owner on public.withdrawal_requests (owner_type, owner_id, status);

alter table public.withdrawal_requests enable row level security;

create policy "withdrawal_requests: admin full access" on public.withdrawal_requests
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "withdrawal_requests: marketer read own" on public.withdrawal_requests
  for select using (owner_type = 'marketer' and owner_id = auth.uid());

create policy "withdrawal_requests: seller read own" on public.withdrawal_requests
  for select using (
    owner_type = 'seller'
    and exists (select 1 from public.stores s where s.id = withdrawal_requests.owner_id and s.owner_id = auth.uid())
  );

-- No insert policy: a request is only ever created through
-- request_withdrawal() below, which validates ownership and balance
-- server-side -- a client can never fabricate or inflate a request.

create or replace function public.request_withdrawal(
  p_owner_type public.wallet_owner_type,
  p_owner_id uuid,
  p_amount numeric,
  p_payout_method_id uuid,
  p_payout_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(12, 2);
  v_request_id uuid;
begin
  if p_owner_type not in ('seller', 'marketer') then
    raise exception 'invalid owner type';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid amount';
  end if;

  if p_owner_type = 'marketer' then
    if p_owner_id is distinct from auth.uid() then
      raise exception 'not authorized for this wallet';
    end if;
  else
    if not exists (select 1 from public.stores s where s.id = p_owner_id and s.owner_id = auth.uid()) then
      raise exception 'not authorized for this wallet';
    end if;
  end if;

  if exists (
    select 1 from public.withdrawal_requests
    where owner_type = p_owner_type and owner_id = p_owner_id and status in ('pending', 'approved')
  ) then
    raise exception 'withdrawal already pending';
  end if;

  select coalesce(sum(amount), 0) into v_balance
  from public.wallet_ledger
  where owner_type = p_owner_type and owner_id = p_owner_id;

  if p_amount > v_balance then
    raise exception 'amount exceeds available balance';
  end if;

  insert into public.withdrawal_requests (owner_type, owner_id, amount, payout_method_id, payout_details)
  values (p_owner_type, p_owner_id, p_amount, p_payout_method_id, p_payout_details)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.request_withdrawal to authenticated;

-- mark_withdrawal_paid(): now just posts one debit ledger entry for the
-- request's owner instead of hunting through order_items -- the ledger
-- itself is the balance, so this can never under- or over-pay.
create or replace function public.mark_withdrawal_paid(p_request_id uuid, p_payment_reference text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.withdrawal_requests%rowtype;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'admin only';
  end if;

  select * into v_request from public.withdrawal_requests where id = p_request_id for update;
  if not found then
    raise exception 'withdrawal request not found';
  end if;
  if v_request.status not in ('pending', 'approved') then
    raise exception 'withdrawal already finalized';
  end if;

  insert into public.wallet_ledger (owner_type, owner_id, entry_type, amount, note)
  values (v_request.owner_type, v_request.owner_id, 'withdrawal_paid', -v_request.amount, 'تنفيذ طلب سحب');

  update public.withdrawal_requests
  set status = 'paid', payment_reference = p_payment_reference, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.reject_withdrawal_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'admin only';
  end if;

  update public.withdrawal_requests
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id and status in ('pending', 'approved');
end;
$$;

grant execute on function public.reject_withdrawal_request to authenticated;
