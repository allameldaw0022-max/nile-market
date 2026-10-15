-- ═══════════════════════════════════════════════════════════════════
-- حالةُ التذكرة بعد ردّ المساعد: نفس خريطة الردّ البشريّ حرفيًّا.
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★★ العطل (عيبٌ في 0071، أي في تصميمي): الدالّة تنقل التذكرة إلى
-- `waiting_customer` من `new` و`open` و`in_progress`. وآلة الحالة
-- `app.can_transition_ticket` **تمنع** `new ⟶ waiting_customer`
-- (مُجرَّب على الإنتاج: تعيد false). فالانتقال يرفع P0001، ويُلتقط في
-- كتلة الاستثناء، فيصل الردّ إلى التاجر وتبقى الحالة «جديدة» أبدًا.
--
-- والأثر على صاحب المنصّة: طابور الدعم يمتلئ بتذاكر **مردودٍ عليها
-- تبدو لم تُقرأ**، فلا يعرف أيّها ينتظره فعلًا. وهو نفس العطل الذي
-- كُتبت 0072 لأجله — فأصلحتُه نصف إصلاح: فتحتُ البوّابة ونسيتُ أنّ
-- الانتقال نفسه غير مشروع.
--
-- ★★★ ولماذا هذا العلاج لا خطوتان: `reply_to_ticket` — مسار الردّ
-- البشريّ القائم منذ الإطلاق — يفعل هذا بعينه:
--
--     ردُّ موظّف:  new | waiting_internal | resolved  ⟶  in_progress
--                 ما عداها                          ⟶  waiting_customer
--
-- وهي خريطةٌ مشروعة كلّها في آلة الحالة. فبدل أن أخترع مشيًا من
-- خطوتين (`new ⟶ in_progress ⟶ waiting_customer`) يُسجّل حدثين في
-- `support_events` ويُنشئ عُرفًا ثانيًا للتذكرة، أنسخ الخريطة القائمة:
-- **ردُّ المساعد يُعامَل كردّ موظّف**، فيقرأ صاحب المنصّة طابورًا واحدًا
-- لا طابورين بعُرفين. وتذكرةٌ جديدة ردّ عليها المساعد تظهر «قيد
-- المعالجة» تمامًا كما لو ردّ عليها إنسان.
--
-- ★★ وما لم يتغيّر — وهو كل شيء عدا حساب الحالة:
--   · علم الجلسة `app.ai_support` وموضعُ إطفائه كما هما.
--   · التقاط الرفض (الردّ أهمّ من الحالة) كما هو، والصيد محدَّد.
--   · `support_events` يسجّل الحالة التي صارت إليها فعلًا.
--   · التوقيع والمنح و`security definer` و`search_path` كما هي.
--
-- ★ و`v_target` متغيّرٌ محلّيّ لا اسمَ عمود إخراج، فلا لبس (0069).
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.ai_support_reply(
  p_ticket_id uuid,
  p_body      text
)
returns table (message_id uuid, status_changed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket  public.support_tickets%rowtype;
  v_msg     uuid;
  v_changed boolean := false;
  v_target  public.ticket_status;
begin
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'VALIDATION: الرسالة فارغة' using errcode = 'P0001';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id;
  if not found then
    raise exception 'NOT_FOUND: التذكرة غير موجودة' using errcode = 'P0002';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'VALIDATION: التذكرة مغلقة' using errcode = 'P0001';
  end if;

  -- علم الجلسة: تقرؤه بوّابة الحارس في 0072. set local ⇒ نطاق المعاملة.
  perform set_config('app.ai_support', 'on', true);

  insert into public.support_messages (ticket_id, author_id, author_kind, body)
  values (p_ticket_id, null, 'staff', trim(p_body))
  returning id into v_msg;

  update public.support_tickets
     set last_message_at   = now(),
         first_response_at = coalesce(first_response_at, now())
   where id = p_ticket_id;

  -- ★★★ الخريطة منسوخة من `reply_to_ticket` (ردُّ موظّف) — انظر أعلى
  --   الملفّ. ولا يُحسب `closed` لأنها رُفضت فوق.
  v_target := case
    when v_ticket.status in ('new', 'waiting_internal', 'resolved') then 'in_progress'
    else 'waiting_customer'
  end;

  if v_target is distinct from v_ticket.status then
    begin
      update public.support_tickets set status = v_target where id = p_ticket_id;
      v_changed := true;
    -- ★ صيدٌ محدَّد: رفض الصلاحية (42501) من المحفّز، أو رفض انتقالٍ
    --   غير مسموح (P0001). وأيّ خطأ آخر يمرّ كما هو — خللٌ حقيقيّ
    --   يجب أن يُسمع لا أن يُبتلع (قاعدة ٨).
    exception when insufficient_privilege or raise_exception then
      v_changed := false;
    end;
  end if;

  insert into public.support_events (ticket_id, actor_id, event, to_value)
  values (p_ticket_id, null, 'ai_replied',
          case when v_changed then v_target::text else v_ticket.status::text end);

  -- يُطفأ فور انتهاء حاجته: set local يمتدّ إلى آخر المعاملة لا الدالّة.
  perform set_config('app.ai_support', '', true);

  perform app.notify(v_ticket.requester_id, 'support.reply',
    'رد جديد على تذكرتك ' || v_ticket.ticket_number,
    left(trim(p_body), 120), '/support/' || p_ticket_id::text,
    v_ticket.store_id, null);

  return query select v_msg, v_changed;
end;
$$;

comment on function public.ai_support_reply(uuid, text) is
  'باب كتابة ضيّق لمساعد الدعم: رسالة staff + وقت آخر رسالة + تنبيه. '
  'وحالةُ التذكرة بنفس خريطة reply_to_ticket لردّ الموظّف (0073).';
