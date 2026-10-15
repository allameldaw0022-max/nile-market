-- =====================================================================
-- Supabase shim للاختبار المحلي فقط — لا يُطبَّق على الإنتاج إطلاقًا.
-- يعيد إنتاج ما توفّره Supabase: سكيمة auth، auth.uid()، الأدوار،
-- وسكيمة extensions — حتى تُختبر سياسات RLS فعليًا لا افتراضًا.
-- =====================================================================
create schema if not exists extensions;
create schema if not exists auth;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public, extensions to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- auth.uid() كما تعرّفها Supabase: من مطالبات JWT في إعداد الجلسة
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'anon'
  );
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- كما تفعل Supabase: service_role يملك كل شيء ويتجاوز RLS.
-- ضروري لاختبار أن قيود CHECK تصمد أمامه فعلًا.
alter default privileges in schema public grant all on tables to service_role;

-- ---------------------------------------------------------------------
-- Storage shim — يعيد إنتاج ما يكفي لاختبار سياسات storage.objects
-- فعليًا (لا محاكاة): buckets · objects · foldername().
-- ---------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets (id),
  name       text not null,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

-- كما تعرّفها Supabase: تقسيم المسار إلى أجزاء (1-indexed)
create or replace function storage.foldername(name text)
returns text[] language plpgsql immutable as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1 : array_length(parts, 1) - 1];
end $$;

create or replace function storage.filename(name text)
returns text language plpgsql immutable as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[array_length(parts, 1)];
end $$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════
-- بدائل `pg_net` و`Vault` — للاختبار المحلّي وحده (0074)
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★ الإضافتان من Supabase ولا تتوفّران في Postgres عاديّ. والبديل
-- هنا **يسجّل النداء ولا يُرسله**: فاختبار القاعدة يتحقّق من أنّ
-- المحفّز نادى بالسرّ الصحيح وبالجسم الصحيح، بلا شبكة. والإرسال
-- الحقيقي ليس من شأن القاعدة.
--
-- ★★★ وهذا الملفّ **لا يُطبَّق على الإنتاج**: `scripts/db-test.sh`
-- وحده يشغّله قبل الهجرات. فلا خطر من بديلٍ أضعف من الحقيقة.

create schema if not exists net;
create schema if not exists vault;

-- ما يُزرع في Vault محلّيًّا — فارغٌ افتراضًا، فيسلك المحفّز مسار
-- «سرّ ناقص» ويخرج بهدوء كما يفعل على الإنتاج لو غاب السرّ.
create table if not exists vault.decrypted_secrets (
  id               uuid primary key default extensions.gen_random_uuid(),
  name             text unique,
  decrypted_secret text
);

-- سجلّ النداءات — تقرؤه الاختبارات بدل الشبكة.
create table if not exists net._http_queue (
  id      bigserial primary key,
  url     text,
  body    jsonb,
  headers jsonb,
  created timestamptz not null default now()
);

create or replace function net.http_post(
  url                  text,
  body                 jsonb default '{}'::jsonb,
  params               jsonb default '{}'::jsonb,
  headers              jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint
language sql
as $$
  insert into net._http_queue (url, body, headers)
  values (url, body, headers)
  returning id;
$$;
