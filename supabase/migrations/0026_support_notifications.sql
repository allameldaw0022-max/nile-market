-- =====================================================================
-- 0026 الدعم والتنبيهات وصندوق البريد (إضافية · لا تمسّ ما سبق)
--
-- `notifications` و`email_outbox` بلا منح كتابة لأي دور عميل (0012):
-- التنبيه يُنشئه النظام لا المستخدم، وإلا صار بإمكان أي حساب أن
-- يدسّ تنبيهًا في صندوق غيره أو يُرسل بريدًا باسم المنصة.
-- المنفذ الوحيد هو دوال `app.*` أدناه، وتُستدعى من دوال مدقَّقة.
-- =====================================================================

-- ---------------------------------------------------------------------
-- إنشاء تنبيه. `dedupe_key` يمنع تكرار نفس التنبيه عند إعادة المحاولة.
-- ---------------------------------------------------------------------
create or replace function app.notify(
  p_user_id    uuid,
  p_type       text,
  p_title      text,
  p_body       text default null,
  p_link       text default null,
  p_store_id   uuid default null,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_user_id is null then return null; end if;

  if p_dedupe_key is not null and exists (
    select 1 from public.notifications
    where user_id = p_user_id and dedupe_key = p_dedupe_key
  ) then
    return null;
  end if;

  insert into public.notifications
    (user_id, store_id, type, title, body, link, dedupe_key)
  values (p_user_id, p_store_id, p_type, p_title, p_body, p_link, p_dedupe_key)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- وضع بريد في الصندوق. الإرسال الفعلي وظيفة خلفية — لا نداء شبكة
-- داخل معاملة قاعدة البيانات، فلا يُقفل الطلب على مزوّد بطيء ولا
-- يُفقد بريد إن فشل الإرسال بعد commit.
-- ---------------------------------------------------------------------
create or replace function app.queue_email(
  p_to         text,
  p_template   text,
  p_payload    jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if coalesce(trim(p_to), '') = '' then return null; end if;

  insert into public.email_outbox (to_email, template, payload, dedupe_key)
  values (lower(trim(p_to)), p_template, coalesce(p_payload, '{}'::jsonb), p_dedupe_key)
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- تنبيه كل من يملك صلاحية في متجر (أعضاء الفريق المعنيّون)
-- ---------------------------------------------------------------------
create or replace function app.notify_store_team(
  p_store_id   uuid,
  p_permission text,
  p_type       text,
  p_title      text,
  p_body       text default null,
  p_link       text default null,
  p_dedupe_key text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_member record; v_count integer := 0;
begin
  for v_member in
    select m.profile_id, m.role, m.permissions
      from public.store_members m
      join public.profiles p on p.id = m.profile_id
     where m.store_id = p_store_id
       and m.status = 'active' and m.deleted_at is null
       and p.account_status = 'active'
  loop
    -- المالك يرى كل شيء؛ غيره يحتاج الصلاحية صراحةً أو بحكم دوره
    if v_member.role = 'owner'
       or p_permission = any(v_member.permissions)
       or p_permission = any(app.role_default_permissions(v_member.role))
    then
      perform app.notify(v_member.profile_id, p_type, p_title, p_body, p_link,
                         p_store_id,
                         case when p_dedupe_key is null then null
                              else p_dedupe_key || ':' || v_member.profile_id::text end);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- =====================================================================
-- تنبيه الطلب الجديد — يصل فريق المتجر لحظة إنشائه
-- =====================================================================
create or replace function app.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_store public.stores%rowtype; v_email text;
begin
  select * into v_store from public.stores where id = new.store_id;

  perform app.notify_store_team(
    new.store_id, 'orders:view', 'order.created',
    'طلب جديد ' || new.order_number,
    new.contact_name || ' · ' || new.total::text || ' ج.س',
    '/dashboard/orders/' || new.id::text,
    'order.created:' || new.id::text);

  select contact_email into v_email from public.store_settings
   where store_id = new.store_id;

  perform app.queue_email(
    v_email, 'order_created',
    jsonb_build_object(
      'order_number', new.order_number,
      'store_name',   v_store.name,
      'customer',     new.contact_name,
      'total',        new.total),
    'order_created:' || new.id::text);

  return new;
end;
$$;

create trigger orders_notify_new
  after insert on public.orders
  for each row execute function app.notify_new_order();

-- تنبيه الزبون المسجَّل عند تغيّر حالة طلبه
create or replace function app.notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_profile uuid; v_label text;
begin
  if new.to_status = 'new' then return new; end if;

  select c.profile_id into v_profile
    from public.orders o
    join public.customers c on c.id = o.customer_id
   where o.id = new.order_id;

  if v_profile is null then return new; end if;

  v_label := case new.to_status
    when 'confirmed' then 'تم تأكيد طلبك'
    when 'preparing' then 'طلبك قيد التجهيز'
    when 'shipped'   then 'تم شحن طلبك'
    when 'completed' then 'تم تسليم طلبك'
    when 'cancelled' then 'أُلغي طلبك'
    else 'تحديث على طلبك'
  end;

  perform app.notify(v_profile, 'order.status', v_label, new.reason, null,
                     new.store_id,
                     'order.status:' || new.order_id::text || ':' || new.to_status::text);
  return new;
end;
$$;

create trigger order_history_notify
  after insert on public.order_status_history
  for each row execute function app.notify_order_status();

-- =====================================================================
-- تذاكر الدعم
-- =====================================================================
create or replace function public.create_support_ticket(
  p_subject        text,
  p_category       public.ticket_category,
  p_body           text,
  p_store_id       uuid default null,
  p_requester_kind public.requester_kind default 'merchant'
)
returns table (ticket_id uuid, ticket_number text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := (select auth.uid());
  v_id   uuid;
  v_num  text;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not app.is_active_account() then
    raise exception 'FORBIDDEN: الحساب غير نشط' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_subject, ''))) < 3 then
    raise exception 'VALIDATION: عنوان التذكرة قصير جدًا' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_body, ''))) < 5 then
    raise exception 'VALIDATION: اشرح مشكلتك في سطر على الأقل' using errcode = 'P0001';
  end if;

  -- متجر مذكور ⇒ يجب أن يكون المُرسِل عضوًا فيه، وإلا صارت التذكرة
  -- وسيلة لربط بلاغ بمتجر لا يخصّه
  if p_store_id is not null and not app.is_store_member(p_store_id) then
    raise exception 'FORBIDDEN: لست عضوًا في هذا المتجر' using errcode = '42501';
  end if;

  -- حد بسيط ضد الإغراق: 5 تذاكر مفتوحة لكل مستخدم
  if (select count(*) from public.support_tickets
      where requester_id = v_user
        and status not in ('resolved', 'closed')) >= 5 then
    raise exception 'VALIDATION: لديك تذاكر مفتوحة كثيرة — تابعها قبل فتح غيرها'
      using errcode = 'P0001';
  end if;

  insert into public.support_tickets
    (requester_id, requester_kind, store_id, subject, category, status)
  values (v_user, p_requester_kind, p_store_id, trim(p_subject),
          coalesce(p_category, 'other'), 'new')
  returning id, support_tickets.ticket_number into v_id, v_num;

  insert into public.support_messages (ticket_id, author_id, author_kind, body)
  values (v_id, v_user, 'requester', trim(p_body));

  return query select v_id, v_num;
end;
$$;

revoke execute on function public.create_support_ticket(
  text, public.ticket_category, text, uuid, public.requester_kind) from public, anon;
grant execute on function public.create_support_ticket(
  text, public.ticket_category, text, uuid, public.requester_kind) to authenticated;

/**
 * ★ توسيع حارس حالة التذكرة (تعديل إضافي لحارس 0012 لا إعادة كتابة له).
 *
 * الحارس الأصلي يسمح بتغيير الحالة لفريق الدعم وحده، باستثناء واحد:
 * `waiting_customer → in_progress` حين يرد العميل. لكن رد العميل على
 * تذكرة «تم حلها» إعادةُ فتح مشروعة أيضًا، وبلا هذا الاستثناء يبقى
 * العميل عالقًا أمام تذكرة حُلَّت دون أن تُحل.
 *
 * وكذلك إغلاق صاحب التذكرة لتذكرته حين يكتفي.
 *
 * الاستثناءان مقيَّدان بصاحب التذكرة وحده: `resolved → in_progress`
 * و«أي حالة → closed». إعادة فتح المغلقة تبقى لفريق الدعم.
 *
 * ★ وأُضيف `security definer`: الحارس يكتب في `support_events`، وهو
 * جدول لا يملك `authenticated` فيه إلا SELECT (0012) — وهو الصواب،
 * فالسجل يكتبه النظام لا المستخدم. بدون ذلك كان أي تغيير لحالة
 * تذكرة يفشل بـ«permission denied for table support_events»، حتى من
 * فريق الدعم. الفحوص أدناه تعتمد على `auth.uid()` فلا يغيّرها هذا.
 */
create or replace function app.guard_ticket_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if not app.can_transition_ticket(old.status, new.status) then
      raise exception 'ILLEGAL_TICKET_TRANSITION: % ← %', new.status, old.status
        using errcode = 'P0001';
    end if;
    if not app.has_platform_permission('support','edit')
       and not (old.status = 'waiting_customer' and new.status = 'in_progress')
       and not (old.status = 'resolved' and new.status = 'in_progress'
                and new.requester_id = (select auth.uid()))
       and not (new.status = 'closed'
                and new.requester_id = (select auth.uid()))
    then
      raise exception 'FORBIDDEN: تغيير حالة التذكرة لفريق الدعم'
        using errcode = '42501';
    end if;
    insert into public.support_events (ticket_id, actor_id, event, from_value, to_value)
    values (new.id, (select auth.uid()), 'status_changed', old.status::text, new.status::text);
  end if;
  return new;
end $$;

/**
 * رد على تذكرة.
 * رد صاحب التذكرة على تذكرة «تم حلها» يعيد فتحها — ولا يُفتح ما
 * أُغلق نهائيًا إلا بتذكرة جديدة.
 */
create or replace function public.reply_to_ticket(
  p_ticket_id uuid,
  p_body      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  t public.support_tickets%rowtype;
  v_is_staff boolean;
begin
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'VALIDATION: الرسالة فارغة' using errcode = 'P0001';
  end if;

  select * into t from public.support_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'NOT_FOUND: التذكرة غير موجودة' using errcode = 'P0002';
  end if;

  v_is_staff := app.has_platform_permission('support', 'edit');
  if t.requester_id <> v_user and not v_is_staff then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if t.status = 'closed' then
    raise exception 'VALIDATION: التذكرة مغلقة — افتح تذكرة جديدة'
      using errcode = 'P0001';
  end if;

  insert into public.support_messages (ticket_id, author_id, author_kind, body)
  values (p_ticket_id, v_user,
          (case when v_is_staff and t.requester_id <> v_user
                then 'staff' else 'requester' end)::public.message_author_kind,
          trim(p_body));

  update public.support_tickets
     set last_message_at   = now(),
         first_response_at = case
           when first_response_at is null and v_is_staff and t.requester_id <> v_user
           then now() else first_response_at end,
         -- الحالات تتبع آلة الحالة في 0012 حرفيًا:
         --   new ينتقل إلى in_progress لا إلى waiting_customer،
         --   وresolved ينتقل إلى in_progress لا إلى open.
         status = (case
           when v_is_staff and t.requester_id <> v_user then
             case when t.status in ('new', 'waiting_internal', 'resolved')
                  then 'in_progress' else 'waiting_customer' end
           when t.status = 'resolved' then 'in_progress'
           when t.status = 'waiting_customer' then 'in_progress'
           else t.status::text end)::public.ticket_status,
         reopened_count = case
           when t.status = 'resolved' and t.requester_id = v_user
           then reopened_count + 1 else reopened_count end
   where id = p_ticket_id;

  -- التنبيه يذهب للطرف الآخر لا للكاتب
  if v_is_staff and t.requester_id <> v_user then
    perform app.notify(t.requester_id, 'support.reply',
      'رد جديد على تذكرتك ' || t.ticket_number,
      left(trim(p_body), 120), '/support/' || t.id::text, t.store_id, null);
  end if;
end;
$$;

revoke execute on function public.reply_to_ticket(uuid, text) from public, anon;
grant   execute on function public.reply_to_ticket(uuid, text) to authenticated;

/** إغلاق التذكرة من صاحبها حين يكتفي. */
create or replace function public.close_my_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare t public.support_tickets%rowtype;
begin
  select * into t from public.support_tickets where id = p_ticket_id;
  if not found then
    raise exception 'NOT_FOUND: التذكرة غير موجودة' using errcode = 'P0002';
  end if;
  if t.requester_id <> (select auth.uid()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if t.status = 'closed' then return; end if;

  update public.support_tickets
     set status = 'closed', closed_at = now()
   where id = p_ticket_id;

  insert into public.support_messages (ticket_id, author_id, author_kind, body)
  values (p_ticket_id, (select auth.uid()), 'system', 'أغلق صاحب التذكرة الطلب.');
end;
$$;

revoke execute on function public.close_my_ticket(uuid) from public, anon;
grant   execute on function public.close_my_ticket(uuid) to authenticated;

-- =====================================================================
-- التنبيهات: القراءة والتعليم كمقروء
-- =====================================================================
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid()); v_count integer;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  -- بلا معرّفات ⇒ «علّم الكل كمقروء»
  update public.notifications
     set read_at = now()
   where user_id = v_user
     and read_at is null
     and (p_ids is null or id = any(p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant   execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- =====================================================================
-- صندوق البريد: السحب والوسم — لـservice_role وحده
--
-- الإرسال يحتاج مفتاح المزوّد، وهو سرّ خادمي. لا مسار للعميل هنا
-- إطلاقًا، لا للقراءة ولا للوسم.
-- =====================================================================
create or replace function public.claim_emails(p_limit integer default 20)
returns table (
  id uuid, to_email text, template text, payload jsonb, attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.email_outbox o
     set status = 'sending', attempts = o.attempts + 1
   where o.id in (
     select e.id from public.email_outbox e
      where e.status = 'queued'
        and e.scheduled_for <= now()
        and e.attempts < 5
      order by e.created_at
      -- القفل يمنع عاملَين من إرسال نفس البريد مرتين
      for update skip locked
      limit greatest(1, least(coalesce(p_limit, 20), 100))
   )
  returning o.id, o.to_email, o.template, o.payload, o.attempts;
end;
$$;

revoke execute on function public.claim_emails(integer) from public, anon, authenticated;
grant   execute on function public.claim_emails(integer) to service_role;

create or replace function public.mark_email_sent(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.email_outbox
     set status = 'sent', sent_at = now(), last_error = null
   where id = p_id;
$$;

revoke execute on function public.mark_email_sent(uuid) from public, anon, authenticated;
grant   execute on function public.mark_email_sent(uuid) to service_role;

create or replace function public.mark_email_failed(p_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.email_outbox
     set -- بعد 5 محاولات يُوسم فاشلًا نهائيًا بدل إعادة محاولة أبدية
         status     = (case when attempts >= 5 then 'failed' else 'queued' end)
                      ::public.email_status,
         last_error = left(coalesce(p_error, ''), 500),
         -- تراجع أسّي: 1 · 2 · 4 · 8 دقائق
         scheduled_for = now() + make_interval(mins => power(2, attempts)::integer)
   where id = p_id;
end;
$$;

revoke execute on function public.mark_email_failed(uuid, text) from public, anon, authenticated;
grant   execute on function public.mark_email_failed(uuid, text) to service_role;
