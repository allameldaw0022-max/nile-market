-- ═══════════════════════════════════════════════════════════════════
-- مساعد الدعم الآليّ — الأساس: قاعدة معرفة متجهيّة وسجلّ وباب كتابة.
-- ═══════════════════════════════════════════════════════════════════
--
-- ★ هذه الهجرة **إضافية بالكامل**: جدولان جديدان وثلاث دوالّ جديدة
--   وامتداد. لا تحذف ولا تعدّل أي جدول أو عمود أو سياسة أو دالّة قائمة.
--
-- ★★ والوصول كلّه من الدوالّ الطرفية بمفتاح `service_role`: الجدولان
--    عليهما RLS **بلا سياسة واحدة**، والمنح مسحوبة من `anon` و
--    `authenticated`. فالمنحة هي الجدار (قاعدة ٩).
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════ ١) الامتداد ═══════════════
--
-- ★ في سكيمة `extensions` لا `public`: مستودعنا كلّه يعمل بـ
--   `set search_path = ''`، وامتدادٌ في `public` يلوّث سكيمة البيانات
--   ويُنبّه عليه مدقّق Supabase الأمني.
create extension if not exists vector with schema extensions;

-- ═══════════════ ٢) مقاطع قاعدة المعرفة ═══════════════

create table if not exists public.support_kb_chunks (
  id           uuid primary key default gen_random_uuid(),
  -- اسم الملفّ المصدر، مثل 'support-knowledge-base.md'
  source       text not null,
  -- العنوان الذي يقع تحته المقطع — يُعرض للمراجعة ويفيد التشخيص
  section      text not null,
  content      text not null,
  -- بصمة النصّ: بها يُعرف المقطع المتغيّر من غيره فلا يُعاد تضمينه
  content_hash text not null,
  embedding    extensions.vector(768) not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ★ الفرادة على (المصدر · البصمة) لا على البصمة وحدها: نصٌّ متطابق في
--   ملفّين مصدرين مختلفين شيئان لا شيء واحد، ولو وحّدناهما لمحا
--   أحدُهما الآخر عند الفهرسة. واليوم المصدر واحد فلا فرق عمليّ —
--   والفرق يظهر يوم يُضاف ملفّ ثانٍ.
create unique index if not exists support_kb_chunks_source_hash
  on public.support_kb_chunks (source, content_hash);

create index if not exists support_kb_chunks_source_idx
  on public.support_kb_chunks (source);

-- ★★ فهرس HNSW بمسافة الجيب (cosine) — وهي ما نستعمله في البحث.
--    وملاحظة صادقة: مقاطع الملفّ اليوم عشرات لا آلاف، ومُخطِّط Postgres
--    سيختار المسح المتسلسل لأنه أسرع عند هذا الحجم. الفهرس للنموّ لا
--    للّحظة، وإنشاؤه الآن أرخص من تذكّره لاحقًا.
create index if not exists support_kb_chunks_embedding_idx
  on public.support_kb_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.support_kb_chunks enable row level security;
-- بلا أي سياسة: لا `anon` ولا `authenticated` يقرأ أو يكتب.
revoke all on public.support_kb_chunks from anon, authenticated;

comment on table public.support_kb_chunks is
  'مقاطع قاعدة معرفة الدعم ومتجهاتها. تُكتب وتُقرأ من الدوالّ الطرفية '
  'بمفتاح service_role وحده — RLS مفعّل بلا سياسة.';

-- ═══════════════ ٣) البحث عن أقرب المقاطع ═══════════════

/**
 * أقرب مقاطع المعرفة لسؤال.
 *
 * ★★★ `language sql` لا `plpgsql` عمدًا: أسماء أعمدة الإخراج
 * (`id` · `source` · `content` …) تصير **متغيّرات** في plpgsql فتلتبس
 * بأعمدة الجدول وترفع `42702` — وهو العطل الذي أوقف حفظ المنتجات
 * منذ الإطلاق (0069). وبـsql لا وجود لمتغيّرات أصلًا.
 *
 * ★★ والمعامل `<=>` مكتوبٌ مؤهَّلًا: `search_path` فارغ، وبدون
 *    التأهيل لا يُحلّ المعامل فتسقط الدالّة.
 *
 * ★ والتشابه = ١ − مسافة الجيب، فيقع بين ٠ و١ ويُقارَن بحدٍّ مفهوم.
 */
create or replace function public.match_support_kb(
  p_query_embedding extensions.vector(768),
  p_match_count     integer default 5,
  p_min_similarity  double precision default 0.5
)
returns table (
  id         uuid,
  source     text,
  section    text,
  content    text,
  similarity double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.source, c.section, c.content,
         1 - (c.embedding operator(extensions.<=>) p_query_embedding) as similarity
    from public.support_kb_chunks c
   where 1 - (c.embedding operator(extensions.<=>) p_query_embedding)
         >= coalesce(p_min_similarity, 0)
   order by c.embedding operator(extensions.<=>) p_query_embedding
   limit greatest(coalesce(p_match_count, 5), 1);
$$;

revoke execute on function public.match_support_kb(
  extensions.vector, integer, double precision) from public, anon, authenticated;
grant execute on function public.match_support_kb(
  extensions.vector, integer, double precision) to service_role;

-- ═══════════════ ٤) سجلّ قرارات المساعد ═══════════════

create table if not exists public.support_ai_logs (
  id            uuid primary key default gen_random_uuid(),
  -- ★★★ فريدٌ لكل تذكرة: هو مفتاح عدم التكرار. الـwebhook قد يصل
  --     مرّتين (إعادة محاولة · نقرة مزدوجة)، والإدراج الثاني يسقط
  --     فتعرف الدالّة الطرفية أنّ التذكرة عولجت ولا تنادي النماذج ثانيةً.
  ticket_id     uuid not null unique
                references public.support_tickets (id) on delete cascade,
  action        text not null
                check (action in ('reply', 'escalate', 'draft')),
  category      text,
  confidence    numeric(3, 2) check (confidence is null
                                     or (confidence >= 0 and confidence <= 1)),
  reason        text,
  draft_reply   text,
  model         text,
  input_tokens  integer,
  output_tokens integer,
  status        text not null default 'pending'
                check (status in ('pending', 'sent', 'escalated',
                                  'declined', 'failed')),
  error         text,
  created_at    timestamptz not null default now(),
  -- ★ يتغيّر حين تضغط زرّ تلغرام: من 'pending' إلى 'sent' أو 'declined'.
  updated_at    timestamptz not null default now()
);

create index if not exists support_ai_logs_status_idx
  on public.support_ai_logs (status, created_at desc);

alter table public.support_ai_logs enable row level security;
revoke all on public.support_ai_logs from anon, authenticated;

comment on table public.support_ai_logs is
  'قرار المساعد الآلي لكل تذكرة. `ticket_id` فريد ⇒ لا معالجة مرّتين. '
  'RLS مفعّل بلا سياسة — الوصول من الدوالّ الطرفية وحدها.';

-- ═══════════════ ٥) باب الكتابة الضيّق ═══════════════

/**
 * كتابة ردّ المساعد في تذكرة.
 *
 * ★★★ لماذا دالّة بدل `update` مباشر: المحفّز `support_tickets_guard`
 * يشترط `has_platform_permission('support','edit')` لأي تغيير حالة،
 * و`service_role` بلا `auth.uid()` فالصلاحية تعود `false` دائمًا.
 * (مُجرَّب: `in_progress ⟶ waiting_customer` ردّ `42501`.)
 *
 * ★★ وهذه الدالّة **بابٌ واحد ضيّق** لا بطاقةُ موظّف: تفعل ثلاثة
 * أشياء ولا شيء غيرها — تُدرج الرسالة، وتحدّث وقت آخر رسالة وأوّل
 * ردّ، وتُنبّه صاحب التذكرة. لا تغلق تذكرة، ولا تحذف، ولا تقرأ جدولًا
 * آخر. والمنحة لـ`service_role` وحده.
 *
 * ★★ وتغيير الحالة **محاولةٌ لا شرط**: المحفّز قد يرفضه (أعلاه)،
 * فيُلتقط الرفض ويُعاد في `status_changed` بدل أن تسقط العملية كلّها —
 * الأهمّ أن يصل الردّ إلى التاجر. ولا يُبتلع الرفض بصمت (قاعدة ٨):
 * الدالّة الطرفية تكتبه في `support_ai_logs.error`.
 *
 * ★ والرسالة `author_kind = 'staff'` فتظهر للتاجر «فريق الدعم» كما
 *   يظهر الردّ البشريّ — وهذا مقصود: لا نُربك التاجر بمصدر الردّ،
 *   والمراجعة البشرية قائمة في وضع المسوّدة.
 */
create or replace function public.ai_support_reply(
  p_ticket_id uuid,
  p_body      text
)
returns table (message_id uuid, status_changed boolean)
language plpgsql
security definer
set search_path = ''
as $$
-- ★ بلا `#variable_conflict use_column`: اسما الخَرْج (`message_id`
--   و`status_changed`) لا يردان مجرَّدين في الجسم إطلاقًا، فلا لبس
--   أصلًا. و0061 رفضت التعطيل الوقائي لأنه يُخفي اللبس بدل إظهاره.
declare
  v_ticket  public.support_tickets%rowtype;
  v_msg     uuid;
  v_changed boolean := false;
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

  -- ★★★ علمُ الجلسة: يُعلن أن هذه الكتابة من مسار المساعد لا من
  --   متصفّح، فيسمح له الحارس بنقل الحالة (البوّابة في 0072).
  --   و`set local` ⇒ ينتهي بانتهاء المعاملة فلا يتسرّب إلى غيرها.
  --   ★ ولا يستطيع مستخدم PostgREST ضبطه: `set_config` في `pg_catalog`
  --     ولا تكشفها PostgREST، والترويسات تذهب إلى `request.*` وحدها.
  --     وهو نفس نمط `app.inventory_movement` في 0004 حرفيًّا.
  perform set_config('app.ai_support', 'on', true);

  insert into public.support_messages (ticket_id, author_id, author_kind, body)
  values (p_ticket_id, null, 'staff', trim(p_body))
  returning id into v_msg;

  update public.support_tickets
     set last_message_at   = now(),
         first_response_at = coalesce(first_response_at, now())
   where id = p_ticket_id;

  -- محاولة وضع التذكرة في انتظار العميل — انظر الشرح أعلاه.
  if v_ticket.status in ('new', 'open', 'in_progress') then
    begin
      update public.support_tickets
         set status = 'waiting_customer'
       where id = p_ticket_id;
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
          case when v_changed then 'waiting_customer' else v_ticket.status::text end);

  -- ★★ يُطفأ العلم فور انتهاء حاجته: `set local` يمتدّ إلى آخر
  --    **المعاملة** لا إلى آخر الدالّة، فلو نُوديت هذه الدالّة داخل
  --    معاملة أوسع لبقيت البوّابة مفتوحة لما بعدها. وإطفاؤه هنا
  --    يُضيّق النافذة إلى هذه الجمل وحدها.
  perform set_config('app.ai_support', '', true);

  perform app.notify(v_ticket.requester_id, 'support.reply',
    'رد جديد على تذكرتك ' || v_ticket.ticket_number,
    left(trim(p_body), 120), '/support/' || p_ticket_id::text,
    v_ticket.store_id, null);

  return query select v_msg, v_changed;
end;
$$;

revoke execute on function public.ai_support_reply(uuid, text)
  from public, anon, authenticated;
grant execute on function public.ai_support_reply(uuid, text) to service_role;

comment on function public.ai_support_reply(uuid, text) is
  'باب كتابة ضيّق لمساعد الدعم: رسالة staff + وقت آخر رسالة + تنبيه. '
  'لا تغلق تذكرة ولا تحذف. ممنوحة لـservice_role وحده.';
