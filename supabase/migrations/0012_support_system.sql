-- =====================================================================
-- 0012 Support · Notifications · Audit · System
--
-- المواصفات: تذاكر دعم فقط، لا شات داخلي عام.
-- الملاحظات الداخلية في **جدول منفصل** ⇒ التسريب مستحيل بنيويًا.
-- D26: الاحتفاظ 30 يومًا للشخصي و24 شهرًا للتذاكر المغلقة
-- D32: Anonymization لا يمسّ لقطات الطلبات والفواتير
-- =====================================================================

create type public.ticket_status as enum (
  'new','open','in_progress','waiting_customer','waiting_internal','resolved','closed'
);
create type public.ticket_priority as enum ('low','normal','high','urgent');
create type public.ticket_category as enum (
  'technical','billing','subscription','orders','domains','account','other'
);
create type public.requester_kind as enum ('merchant','customer','partner');
create type public.message_author_kind as enum ('requester','staff','system');
create type public.job_status as enum ('queued','running','done','failed');
create type public.email_status as enum ('queued','sending','sent','failed');
create type public.health_status as enum ('healthy','degraded','down');

-- ---------------------------------------------------------------------
-- support_tickets
-- ---------------------------------------------------------------------
create table public.support_tickets (
  id                    uuid primary key default gen_random_uuid(),
  ticket_number         text not null unique,
  requester_id          uuid not null references public.profiles (id) on delete restrict,
  requester_kind        public.requester_kind not null,
  store_id              uuid references public.stores (id) on delete set null,
  subject               text not null check (length(trim(subject)) between 3 and 200),
  category              public.ticket_category not null default 'other',
  priority              public.ticket_priority not null default 'normal',
  status                public.ticket_status not null default 'new',
  assigned_to           uuid references public.admin_members (id) on delete set null,
  related_order_id      uuid references public.orders (id) on delete set null,
  related_payment_id    uuid references public.payments (id) on delete set null,
  related_subscription_id uuid references public.subscriptions (id) on delete set null,
  first_response_at     timestamptz,
  resolved_at           timestamptz,
  closed_at             timestamptz,
  reopened_count        integer not null default 0,
  last_message_at       timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index support_tickets_queue_idx
  on public.support_tickets (status, priority, created_at desc);
create index support_tickets_requester_idx on public.support_tickets (requester_id);
create index support_tickets_store_idx     on public.support_tickets (store_id);
create index support_tickets_assigned_idx  on public.support_tickets (assigned_to);

create trigger support_tickets_set_updated_at before update on public.support_tickets
  for each row execute function app.set_updated_at();

alter table public.support_tickets enable row level security;

create sequence if not exists public.ticket_number_seq;

create or replace function app.set_ticket_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.ticket_number is null or new.ticket_number = '' then
    new.ticket_number := 'NM-' || to_char(now(), 'YYYY') || '-' ||
                         lpad(nextval('public.ticket_number_seq')::text, 6, '0');
  end if;
  return new;
end $$;

create trigger support_tickets_number before insert on public.support_tickets
  for each row execute function app.set_ticket_number();

-- ---------------------------------------------------------------------
-- support_messages
-- ---------------------------------------------------------------------
create table public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  author_kind public.message_author_kind not null,
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now()
);

create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

alter table public.support_messages enable row level security;

-- ---------------------------------------------------------------------
-- ★ support_internal_notes — جدول منفصل، لا عمود is_internal.
-- لا توجد أي سياسة تمنح صاحب التذكرة القراءة ⇒ التسريب مستحيل بنيويًا.
-- ---------------------------------------------------------------------
create table public.support_internal_notes (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets (id) on delete cascade,
  author_id  uuid not null references public.admin_members (id) on delete restrict,
  body       text not null,
  created_at timestamptz not null default now()
);

create index support_internal_notes_ticket_idx
  on public.support_internal_notes (ticket_id, created_at);

alter table public.support_internal_notes enable row level security;

create table public.support_attachments (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references public.support_tickets (id) on delete cascade,
  message_id    uuid references public.support_messages (id) on delete cascade,
  media_file_id uuid not null references public.media_files (id) on delete cascade,
  uploaded_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.support_attachments enable row level security;

create table public.support_events (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  event      text not null,
  from_value text,
  to_value   text,
  created_at timestamptz not null default now()
);

create index support_events_ticket_idx on public.support_events (ticket_id, created_at);
create trigger support_events_no_update before update on public.support_events
  for each row execute function app.block_mutation();
create trigger support_events_no_delete before delete on public.support_events
  for each row execute function app.block_mutation();

alter table public.support_events enable row level security;

-- آلة حالة التذكرة
create or replace function app.can_transition_ticket(
  p_from public.ticket_status, p_to public.ticket_status
) returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_from = 'new' then p_to in ('open','in_progress','closed')
    when p_from = 'open' then p_to in ('in_progress','waiting_customer','waiting_internal','resolved','closed')
    when p_from = 'in_progress' then p_to in ('waiting_customer','waiting_internal','resolved','closed')
    when p_from = 'waiting_customer' then p_to in ('in_progress','resolved','closed')
    when p_from = 'waiting_internal' then p_to in ('in_progress','resolved','closed')
    when p_from = 'resolved' then p_to in ('closed','in_progress')
    when p_from = 'closed' then p_to in ('open')
    else false
  end;
$$;

create or replace function app.guard_ticket_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if not app.can_transition_ticket(old.status, new.status) then
      raise exception 'ILLEGAL_TICKET_TRANSITION: % ← %', new.status, old.status
        using errcode = 'P0001';
    end if;
    if not app.has_platform_permission('support','edit')
       and not (old.status = 'waiting_customer' and new.status = 'in_progress') then
      raise exception 'FORBIDDEN: تغيير حالة التذكرة لفريق الدعم'
        using errcode = '42501';
    end if;
    insert into public.support_events (ticket_id, actor_id, event, from_value, to_value)
    values (new.id, (select auth.uid()), 'status_changed', old.status::text, new.status::text);
  end if;
  return new;
end $$;

create trigger support_tickets_guard before update on public.support_tickets
  for each row execute function app.guard_ticket_status();

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  store_id   uuid references public.stores (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  link       text,
  data       jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create unique index notifications_dedupe
  on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index notifications_user_idx
  on public.notifications (user_id, read_at, created_at desc);

alter table public.notifications enable row level security;

create table public.email_outbox (
  id            uuid primary key default gen_random_uuid(),
  to_email      text not null,
  template      text not null,
  payload       jsonb not null default '{}'::jsonb,
  status        public.email_status not null default 'queued',
  attempts      integer not null default 0,
  last_error    text,
  dedupe_key    text unique,
  scheduled_for timestamptz not null default now(),
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index email_outbox_queue_idx on public.email_outbox (status, scheduled_for);
alter table public.email_outbox enable row level security;

create table public.job_queue (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,
  payload      jsonb not null default '{}'::jsonb,
  status       public.job_status not null default 'queued',
  attempts     integer not null default 0,
  max_attempts integer not null default 5,
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  created_at   timestamptz not null default now()
);

create index job_queue_ready_idx on public.job_queue (status, run_after);
alter table public.job_queue enable row level security;

-- ---------------------------------------------------------------------
-- audit_logs — إلحاقي، لا يحذفه أحد (المواصفات §30)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references public.profiles (id) on delete set null,
  actor_kind    public.actor_kind not null default 'system',
  store_id      uuid references public.stores (id) on delete set null,
  action        text not null,
  resource_type text,
  resource_id   uuid,
  before        jsonb,
  after         jsonb,
  ip_hash       text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index audit_logs_store_idx  on public.audit_logs (store_id, created_at desc);
create index audit_logs_actor_idx  on public.audit_logs (actor_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);

alter table public.audit_logs force row level security;
create trigger audit_logs_no_update before update on public.audit_logs
  for each row execute function app.block_mutation();
create trigger audit_logs_no_delete before delete on public.audit_logs
  for each row execute function app.block_mutation();

alter table public.audit_logs enable row level security;

-- كتابة سجل تدقيق من داخل القاعدة
create or replace function app.audit(
  p_action text, p_resource_type text default null, p_resource_id uuid default null,
  p_store_id uuid default null, p_before jsonb default null, p_after jsonb default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs
    (actor_id, actor_kind, store_id, action, resource_type, resource_id, before, after)
  values ((select auth.uid()),
          case when app.is_platform_staff() then 'platform'::public.actor_kind
               when (select auth.uid()) is null then 'system'::public.actor_kind
               else 'store'::public.actor_kind end,
          p_store_id, p_action, p_resource_type, p_resource_id, p_before, p_after);
end $$;

grant execute on function app.audit(text, text, uuid, uuid, jsonb, jsonb) to authenticated;

-- trigger تدقيق عام للجداول الحساسة
create or replace function app.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
  v_res   uuid;
  v_row   jsonb := to_jsonb(coalesce(new, old));
begin
  -- store_id فقط إن وُجد العمود. لا يُستخدم id كبديل: جداول مثل
  -- partners وplans ليست مستأجَرة، وإسناد معرّفها كـstore_id ينتهك الـFK.
  begin
    v_store := (v_row ->> 'store_id')::uuid;
  exception when others then v_store := null; end;

  -- بعض الجداول مفتاحها ليس uuid (platform_settings.id منطقي مثلًا)
  begin
    v_res := (v_row ->> 'id')::uuid;
  exception when others then v_res := null; end;

  insert into public.audit_logs
    (actor_id, actor_kind, store_id, action, resource_type, resource_id, before, after)
  values ((select auth.uid()),
          case when app.is_platform_staff() then 'platform'::public.actor_kind
               when (select auth.uid()) is null then 'system'::public.actor_kind
               else 'store'::public.actor_kind end,
          v_store,
          tg_table_name || '.' || lower(tg_op),
          tg_table_name,
          v_res,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- الجداول التي تُدقَّق تلقائيًا (المواصفات §30)
create trigger audit_products     after insert or update or delete on public.products
  for each row execute function app.audit_row_change();
create trigger audit_store_members after insert or update or delete on public.store_members
  for each row execute function app.audit_row_change();
create trigger audit_payments     after insert or update on public.payments
  for each row execute function app.audit_row_change();
create trigger audit_refunds      after insert or update on public.refunds
  for each row execute function app.audit_row_change();
create trigger audit_partners     after insert or update on public.partners
  for each row execute function app.audit_row_change();
create trigger audit_payouts      after insert or update on public.partner_payouts
  for each row execute function app.audit_row_change();
create trigger audit_plans        after insert or update on public.plans
  for each row execute function app.audit_row_change();
create trigger audit_entitlements after update on public.plan_entitlements
  for each row execute function app.audit_row_change();
create trigger audit_settings     after update on public.platform_settings
  for each row execute function app.audit_row_change();
create trigger audit_admin_perms  after insert or update or delete on public.admin_permissions
  for each row execute function app.audit_row_change();
create trigger audit_domains      after insert or update on public.store_domains
  for each row execute function app.audit_row_change();

-- ---------------------------------------------------------------------
-- feature_flags · idempotency · rate limit · analytics · health
-- ---------------------------------------------------------------------
create table public.feature_flags (
  key         text primary key,
  description text,
  enabled     boolean not null default false,
  rollout     jsonb not null default '{}'::jsonb,
  updated_by  uuid references public.profiles (id),
  updated_at  timestamptz not null default now()
);

insert into public.feature_flags (key, description, enabled) values
  ('legacy_marketers', 'نظام المسوّقين القديم — خارج V1 (D11)', false),
  ('reviews',          'التقييمات والمراجعات — خارج v1', false),
  ('custom_domains',   'الدومينات المخصصة', false),
  ('csv_import',       'استيراد المنتجات CSV', true),
  ('pwa_offline',      'وضع العمل بلا اتصال', true);

alter table public.feature_flags enable row level security;

-- الإنفاذ خادمي: الميزة المطفأة تُمنع في الخادم لا تُخفى في الواجهة (§35)
create or replace function app.feature_enabled(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.feature_flags where key = p_key), false);
$$;

grant execute on function app.feature_enabled(text) to anon, authenticated;

create table public.idempotency_keys (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null,
  key          text not null,
  request_hash text,
  status       text not null default 'in_progress',
  response     jsonb,
  expires_at   timestamptz not null default now() + interval '24 hours',
  created_at   timestamptz not null default now(),
  unique (scope, key)
);

alter table public.idempotency_keys enable row level security;

create table public.rate_limit_counters (
  bucket       text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limit_counters enable row level security;

create or replace function public.check_rate_limit(
  p_bucket text, p_max integer, p_window_seconds integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_window timestamptz; v_count integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_counters (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update
    set count = public.rate_limit_counters.count + 1
  returning count into v_count;
  return v_count <= p_max;
end $$;

revoke execute on function public.check_rate_limit(text, integer, integer) from public;
grant   execute on function public.check_rate_limit(text, integer, integer) to anon, authenticated;

create table public.analytics_daily (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores (id) on delete cascade,
  date            date not null,
  visits          integer not null default 0,
  unique_visitors integer not null default 0,
  orders_count    integer not null default 0,
  orders_revenue  numeric(14,2) not null default 0,
  new_customers   integer not null default 0,
  products_sold   integer not null default 0,
  conversion_rate numeric(6,4),
  unique (store_id, date)
);

create index analytics_daily_store_idx on public.analytics_daily (store_id, date desc);
alter table public.analytics_daily enable row level security;

create table public.store_visits (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores (id) on delete cascade,
  visitor_token text,
  path          text,
  created_at    timestamptz not null default now()
);

create index store_visits_store_idx on public.store_visits (store_id, created_at);
alter table public.store_visits enable row level security;

create table public.system_health_checks (
  id         uuid primary key default gen_random_uuid(),
  component  text not null,
  status     public.health_status not null,
  latency_ms integer,
  detail     text,
  checked_at timestamptz not null default now()
);

create index system_health_idx on public.system_health_checks (component, checked_at desc);
alter table public.system_health_checks enable row level security;

-- تجميع التحليلات (pg_cron) — لوحة الإحصائيات لا تمسح جدول الطلبات (§25)
create or replace function public.aggregate_analytics(p_date date default current_date - 1)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.analytics_daily
    (store_id, date, orders_count, orders_revenue, new_customers, products_sold, visits, unique_visitors)
  select o.store_id, p_date,
         count(distinct o.id),
         coalesce(sum(o.total), 0),
         (select count(*) from public.customers c
           where c.store_id = o.store_id and c.first_order_at::date = p_date),
         coalesce((select sum(oi.quantity) from public.order_items oi
                    join public.orders o2 on o2.id = oi.order_id
                   where o2.store_id = o.store_id and o2.created_at::date = p_date), 0),
         coalesce((select count(*) from public.store_visits v
                    where v.store_id = o.store_id and v.created_at::date = p_date), 0),
         coalesce((select count(distinct v.visitor_token) from public.store_visits v
                    where v.store_id = o.store_id and v.created_at::date = p_date), 0)
    from public.orders o
   where o.created_at::date = p_date
   group by o.store_id
  on conflict (store_id, date) do update
    set orders_count = excluded.orders_count,
        orders_revenue = excluded.orders_revenue,
        new_customers = excluded.new_customers,
        products_sold = excluded.products_sold,
        visits = excluded.visits,
        unique_visitors = excluded.unique_visitors;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.aggregate_analytics(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- D26/D32: الاحتفاظ وإخفاء الهوية
-- ---------------------------------------------------------------------
create table public.account_deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  requested_at  timestamptz not null default now(),
  execute_after timestamptz not null,
  cancelled_at  timestamptz,
  executed_at   timestamptz,
  unique (profile_id)
);

alter table public.account_deletion_requests enable row level security;

-- ★ D32: قائمة بيضاء صريحة. لا يمسّ orders/order_items/invoices/المالية.
create or replace function public.anonymize_due_accounts()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in
    select * from public.account_deletion_requests
     where cancelled_at is null and executed_at is null and execute_after <= now()
  loop
    -- 1) البروفايل
    update public.profiles
       set full_name = 'مستخدم محذوف', phone = null, avatar_url = null,
           account_status = 'closed', anonymized_at = now()
     where id = r.profile_id;

    -- 2) سجلات العميل داخل المتاجر
    update public.customers
       set name = 'عميل محذوف', phone = null, email = null, notes = null,
           anonymized_at = now()
     where profile_id = r.profile_id;

    -- 3) العناوين
    update public.customer_addresses
       set recipient_name = 'عميل محذوف', phone = '', address_line = '',
           landmark = null, deleted_at = now()
     where customer_id in (select id from public.customers where profile_id = r.profile_id);

    -- ❌ لا يُمسّ: orders · order_items · invoices · payments · refunds ·
    --    ledger_entries · commission_ledger · audit_logs (D32)

    update public.account_deletion_requests set executed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.anonymize_due_accounts() from public, anon, authenticated;

-- D26: تنظيف تذاكر الدعم المغلقة بعد 24 شهرًا (ما لم ترتبط بمال أو نزاع)
create or replace function public.purge_old_tickets()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_months integer; n integer;
begin
  select retention_months_tickets into v_months from public.platform_settings where id = true;
  delete from public.support_tickets
   where status = 'closed'
     and closed_at is not null
     and closed_at < now() - make_interval(months => coalesce(v_months, 24))
     and related_payment_id is null
     and related_subscription_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.purge_old_tickets() from public, anon, authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
create policy tickets_requester on public.support_tickets
  for select to authenticated using (requester_id = (select auth.uid()));

create policy tickets_store_read on public.support_tickets
  for select to authenticated
  using (store_id is not null and app.has_store_permission(store_id, 'support:manage'));

create policy tickets_requester_insert on public.support_tickets
  for insert to authenticated with check (requester_id = (select auth.uid()));

create policy tickets_staff_read on public.support_tickets
  for select to authenticated using (app.has_platform_permission('support','view'));

create policy tickets_staff_write on public.support_tickets
  for update to authenticated
  using (app.has_platform_permission('support','edit'))
  with check (app.has_platform_permission('support','edit'));

create policy messages_read on public.support_messages
  for select to authenticated
  using (exists (select 1 from public.support_tickets t
                 where t.id = ticket_id
                   and (t.requester_id = (select auth.uid())
                        or (t.store_id is not null
                            and app.has_store_permission(t.store_id,'support:manage'))))
         or app.has_platform_permission('support','view'));

create policy messages_insert on public.support_messages
  for insert to authenticated
  with check (exists (select 1 from public.support_tickets t
                      where t.id = ticket_id and t.requester_id = (select auth.uid()))
              or app.has_platform_permission('support','edit'));

-- ★ لا سياسة لصاحب التذكرة إطلاقًا
create policy internal_notes_staff_only on public.support_internal_notes
  for all to authenticated
  using (app.has_platform_permission('support','view'))
  with check (app.has_platform_permission('support','edit'));

create policy attachments_read on public.support_attachments
  for select to authenticated
  using (exists (select 1 from public.support_tickets t
                 where t.id = ticket_id and t.requester_id = (select auth.uid()))
         or app.has_platform_permission('support','view'));

create policy attachments_insert on public.support_attachments
  for insert to authenticated
  with check (exists (select 1 from public.support_tickets t
                      where t.id = ticket_id and t.requester_id = (select auth.uid()))
              or app.has_platform_permission('support','edit'));

create policy support_events_read on public.support_events
  for select to authenticated using (app.has_platform_permission('support','view'));

create policy notifications_self on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

create policy notifications_self_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy flags_read on public.feature_flags for select to anon, authenticated using (true);
create policy flags_write on public.feature_flags
  for all to authenticated
  using (app.has_platform_permission('feature_flags','manage'))
  with check (app.has_platform_permission('feature_flags','manage'));

create policy audit_store_read on public.audit_logs
  for select to authenticated
  using (store_id is not null and app.has_store_permission(store_id, 'audit:view'));

create policy audit_platform_read on public.audit_logs
  for select to authenticated
  using (app.has_platform_permission('audit_logs','view'));

create policy analytics_store_read on public.analytics_daily
  for select to authenticated
  using (app.has_store_permission(store_id, 'analytics:view'));

create policy analytics_platform_read on public.analytics_daily
  for select to authenticated using (app.has_platform_permission('reports','view'));

create policy health_read on public.system_health_checks
  for select to authenticated using (app.has_platform_permission('system_health','view'));

create policy deletion_self on public.account_deletion_requests
  for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- email_outbox · job_queue · idempotency_keys · rate_limit_counters ·
-- store_visits: بلا سياسات ⇒ للنظام فقط عبر service_role/RPC.

-- =====================================================================
-- المنح
-- =====================================================================
grant select, insert, update on public.support_tickets   to authenticated;
grant select, insert on public.support_messages          to authenticated;
grant select, insert, update, delete on public.support_internal_notes to authenticated;
grant select, insert on public.support_attachments       to authenticated;
grant select on public.support_events                    to authenticated;
grant select, update on public.notifications             to authenticated;
grant select on public.feature_flags to anon, authenticated;
grant insert, update, delete on public.feature_flags to authenticated;
grant select on public.audit_logs       to authenticated;
grant select on public.analytics_daily  to authenticated;
grant select on public.system_health_checks to authenticated;
grant select, insert, update on public.account_deletion_requests to authenticated;
revoke insert, update, delete on public.audit_logs from anon, authenticated;
