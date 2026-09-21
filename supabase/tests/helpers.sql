-- أدوات الاختبار: انتحال هوية مستخدم كما تفعل Supabase عبر JWT.
create schema if not exists t;

create or replace function t.login(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function t.logout()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;

create or replace function t.reset()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- تأكيد: يجب أن يكون الشرط صحيحًا
create or replace function t.ok(p_cond boolean, p_label text)
returns text language plpgsql as $$
begin
  if p_cond then return '  ✓ ' || p_label;
  else raise exception 'FAIL: %', p_label; end if;
end $$;

-- تأكيد: يجب أن يفشل التعبير
create or replace function t.throws(p_sql text, p_label text)
returns text language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return '  ✓ ' || p_label || ' (رُفض: ' || sqlstate || ')';
  end;
  raise exception 'FAIL: % — نجح وكان يجب أن يُرفض', p_label;
end $$;

-- تأكيد: الاستعلام يعيد صفرًا من الصفوف
create or replace function t.empty(p_sql text, p_label text)
returns text language plpgsql as $$
declare n integer;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  if n = 0 then return '  ✓ ' || p_label;
  else raise exception 'FAIL: % — ظهر % صف وكان يجب ألا يظهر شيء', p_label, n; end if;
exception
  -- انعدام المنح على مستوى الجدول ضمان أقوى من ترشيح RLS — يُعدّ نجاحًا
  when insufficient_privilege then
    return '  ✓ ' || p_label || ' (لا منح على الجدول أصلًا)';
end $$;

grant usage on schema t to anon, authenticated;
grant execute on all functions in schema t to anon, authenticated;

-- RLS على UPDATE/DELETE لا ترفع استثناءً — ترشّح الصفوف بصمت.
-- لذلك التأكيد الصحيح هو «لم يتأثر أي صف»، لا «رُمي استثناء».
create or replace function t.no_effect(p_sql text, p_label text)
returns text language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n = 0 then return '  ✓ ' || p_label || ' (0 صف)';
  else raise exception 'FAIL: % — تأثّر % صف', p_label, n; end if;
exception
  when insufficient_privilege then
    return '  ✓ ' || p_label || ' (رُفض: 42501)';
end $$;

grant execute on all functions in schema t to anon, authenticated;
grant usage on schema t to service_role;
grant execute on all functions in schema t to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant usage on schema app to service_role;
grant execute on all functions in schema app to service_role;

create or replace function t.throws_check(p_sql text, p_label text)
returns text language plpgsql as $$
begin
  begin
    execute p_sql;
  exception
    when check_violation then
      return '  ✓ ' || p_label || ' (قيد CHECK: 23514)';
    when others then
      raise exception 'FAIL: % — رُفض بـ% وليس بقيد CHECK', p_label, sqlstate;
  end;
  raise exception 'FAIL: % — نجح وكان يجب أن يُرفض', p_label;
end $$;

grant execute on all functions in schema t to anon, authenticated, service_role;
