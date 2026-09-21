-- =====================================================================
-- Nile Market V1 — 0001 Foundation
-- الامتدادات، سكيمة app الخاصة، الأنواع المشتركة، ودوال البنية التحتية.
--
-- قواعد حاكمة (D1, D7, D8, D9):
--  * سكيمة `app` غير مكشوفة عبر PostgREST — تحوي كل دوال السلطة.
--  * كل دالة تحدد `search_path` صراحة (درس legacy/0021).
--  * الأموال numeric(14,2) — لا floating point.
--  * كل الجداول الإلحاقية تُحمى بـtrigger يرفض UPDATE/DELETE.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- ---------------------------------------------------------------------
-- سكيمة app: كل ما يخص السلطة والتحقق. لا تُكشف عبر API إطلاقًا.
-- ---------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, anon;

-- ---------------------------------------------------------------------
-- الأنواع المشتركة
-- ---------------------------------------------------------------------
create type public.account_status as enum ('active', 'suspended', 'closed');

create type public.store_status as enum (
  'draft', 'pending_review', 'active', 'closed', 'suspended'
);

create type public.store_role as enum (
  'owner', 'manager', 'orders', 'products', 'customer_service'
);

create type public.member_status as enum ('invited', 'active', 'suspended');

create type public.admin_section as enum (
  'dashboard','merchants','stores','users','employees','orders','products',
  'customers','plans','subscriptions','payments','commissions','partners',
  'payouts','domains','notifications','support','reports','security',
  'audit_logs','feature_flags','system_health','maintenance','settings','content'
);

create type public.admin_level as enum (
  'none','view','create','edit','delete','approve','manage'
);

create type public.actor_kind as enum (
  'store','platform','partner','customer','system'
);

-- ---------------------------------------------------------------------
-- ترتيب مستويات صلاحية المنصة (تراكمي تصاعديًا)
-- ---------------------------------------------------------------------
create or replace function app.level_rank(p_level public.admin_level)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_level
    when 'none'    then 0
    when 'view'    then 1
    when 'create'  then 2
    when 'edit'    then 3
    when 'delete'  then 4
    when 'approve' then 5
    when 'manage'  then 6
  end;
$$;

-- ---------------------------------------------------------------------
-- ختم updated_at
-- ---------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- حارس الجداول الإلحاقية (Append-only)
-- يُستخدم على: ledger_entries · commission_ledger · audit_logs ·
-- inventory_movements · order_status_history · subscription_events ·
-- payment_events · support_events
-- ---------------------------------------------------------------------
create or replace function app.block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'APPEND_ONLY: جدول % لا يقبل التعديل أو الحذف', tg_table_name
    using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------
-- منع تغيير عمود ملكية المستأجر على أي جدول مستأجَر.
-- يقفل ثغرة «تحويل صف من متجر A إلى متجر B» عبر UPDATE.
-- ---------------------------------------------------------------------
create or replace function app.freeze_store_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.store_id is distinct from old.store_id then
    raise exception 'IMMUTABLE_TENANT: لا يمكن نقل صف بين المتاجر'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- تنسيق مبلغ مالي: تقريب موحّد لخانتين لكل العمليات المالية.
-- ---------------------------------------------------------------------
create or replace function app.money(p_value numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(coalesce(p_value, 0)::numeric, 2);
$$;

-- ---------------------------------------------------------------------
-- توليد توكن عشوائي آمن (دعوات، تحقق دومين، إلخ)
-- ---------------------------------------------------------------------
create or replace function app.random_token(p_bytes integer default 32)
returns text
language sql
volatile
set search_path = ''
as $$
  select encode(extensions.gen_random_bytes(p_bytes), 'hex');
$$;

create or replace function app.hash_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- ---------------------------------------------------------------------
-- تجزئة عنوان IP — لا يُخزَّن الـIP خامًا في أي جدول (SECURITY.md §16.11)
-- ---------------------------------------------------------------------
create or replace function app.hash_ip(p_ip text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_ip is null or p_ip = '' then null
    else encode(extensions.digest(p_ip, 'sha256'), 'hex')
  end;
$$;

-- ---------------------------------------------------------------------
-- تنقية slug: حروف وأرقام وشرطات فقط، صالح للـURL.
-- ---------------------------------------------------------------------
create or replace function app.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9؀-ۿ]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  );
$$;

revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.level_rank(public.admin_level) to authenticated;
