-- ═══════════════════════════════════════════════════════════════════
-- بوّابة واحدة في حارس حالة التذكرة — ليصير طابور الدعم صادقًا.
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★★ المشكلة: `support_tickets_guard` يشترط
-- `has_platform_permission('support','edit')` لأي تغيير حالة، و
-- `service_role` بلا `auth.uid()` فالصلاحية تعود `false` **دائمًا**.
-- (مُجرَّب على الإنتاج: `in_progress ⟶ waiting_customer` ردّ `42501`.)
--
-- والأثر: مساعد الدعم يكتب الردّ فيصل التاجر، لكن التذكرة تبقى
-- «قيد المعالجة» إلى الأبد ⇒ طابور الدعم يمتلئ بتذاكر **مردودٍ عليها
-- تبدو معلّقة**، فلا يعرف صاحب المنصّة أيّها ينتظره فعلًا. وطابورٌ
-- يكذب أسوأ من طابورٍ طويل.
--
-- ★★ ولماذا بوّابة لا صلاحية: إعطاء المساعد صلاحية موظّف دعم يجعله
-- قادرًا على **كل شيء** في أي تذكرة — يغلقها ويحوّلها ويعدّلها. وهذه
-- البوّابة تسمح بالانتقال وحده، من مسارٍ واحد، ولا تمسّ بقية الحارس.
--
-- ★★ وأمانها: العلم `app.ai_support` لا يضعه إلا
-- `public.ai_support_reply` بـ`set local` (ينتهي بانتهاء المعاملة)،
-- وتلك ممنوحة لـ`service_role` وحده ومسحوبة من `anon` و`authenticated`.
-- ولا يستطيع مستخدم PostgREST ضبطه: `set_config` تعيش في `pg_catalog`
-- ولا تكشفها PostgREST، وترويسات الطلب تذهب إلى `request.*` لا إلى
-- `app.*`. وهو **نفس نمط `app.inventory_movement`** الذي يحرس كمّيات
-- المخزون في هذا المستودع منذ 0004.
--
-- ★ وما لم يتغيّر — وهو كل شيء عدا سطر:
--   · آلة الحالة `can_transition_ticket` كما هي، فلا انتقال غير مشروع
--     يمرّ ولو بالعلم (المساعد لا يستطيع فتح تذكرة مغلقة مثلًا).
--   · استثناءات العميل الثلاثة كما هي حرفًا بحرف.
--   · تسجيل الحدث في `support_events` كما هو.
--   · التوقيع واللغة و`security definer` و`search_path` كما هي.
-- ═══════════════════════════════════════════════════════════════════

create or replace function app.guard_ticket_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if not app.can_transition_ticket(old.status, new.status) then
      raise exception 'ILLEGAL_TICKET_TRANSITION: % ← %', new.status, old.status
        using errcode = 'P0001';
    end if;
    if not app.has_platform_permission('support','edit')
       -- ★★★ السطر المضاف وحده: مسار مساعد الدعم (انظر أعلى الملفّ).
       and not coalesce(current_setting('app.ai_support', true), '') = 'on'
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

comment on function app.guard_ticket_status() is
  'حارس حالة التذكرة. يسمح لمسار مساعد الدعم بعلم الجلسة '
  '`app.ai_support` الذي لا تضعه إلا public.ai_support_reply (0071).';
