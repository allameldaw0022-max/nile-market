-- ═══════════════════════════════════════════════════════════════════
-- التوصيل: محفّزٌ يوقظ مساعد الدعم عند رسالة صاحب التذكرة.
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★★ لماذا `pg_net` لا نداءٌ متزامن: `net.http_post` تضع الطلب في
-- طابور وتعود فورًا. ولو نُودي المساعد متزامنًا لانتظر التاجرُ النموذجَ
-- (ثوانٍ)، ولو سقط المزوّد لفشل **فتح التذكرة** نفسه. والدعم ميزةٌ
-- إضافية لا يجوز أن تُعطّل المسار الأساس.
--
-- ★★★ والسرّ من Vault لا من نصّ الدالّة: تعريف الدالّة يقرؤه أي دورٍ
-- يملك `pg_get_functiondef`، ويظهر في كل نسخة احتياطية ومخطّط مُصدَّر،
-- وهجرةٌ تحمل سرًّا تصل GitHub. فالقيمتان تُزرعان يدويًّا مرّة واحدة
-- (انظر أسفل الملفّ) وتُقرآن وقت النداء.
--
-- ★★ والشرط في `when` لا في جسم الدالّة: ردُّ المساعد نفسه يُكتب
-- `author_kind = 'staff'`، فبلا الشرط يوقظ المساعدُ نفسَه في حلقة لا
-- تنتهي. ووضعُه في `when` يمنع نداء المحفّز أصلًا لرسائل الموظّفين
-- والنظام — لا أن يُنادى ثم يخرج.
--
-- ★★ ولا يُسقط إدراج الرسالة مهما حدث: محفّز `after` يرفع ⇒ تُلغى
-- المعاملة كلّها ⇒ تاجرٌ يكتب رسالته فيُقال له «فشل» لأنّ طابور الشبكة
-- امتلأ. فكل خطأ يُبتلع إلى `raise warning` — وهذا **الاستثناء الوحيد**
-- المقبول من قاعدة «لا تبتلع خطأً» (قاعدة ٨): الأثر في سجلّ Postgres،
-- والبديل خسارةُ رسالة تاجر.
-- ═══════════════════════════════════════════════════════════════════

-- ★★ `pg_net` إضافةُ Supabase ولا تتوفّر في Postgres عاديّ، وفحص
--    القاعدة المحلّي يبني المخطّط كلّه. فالإنشاء مشروطٌ بتوفّرها،
--    ويُشترط بعده وجود `net.http_post` — فبيئةٌ بلا الإضافة **وبلا**
--    بديلٍ لها تسقط هنا بوضوح بدل أن تمضي ثم يصمت المحفّز في الإنتاج.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception 'pg_net غائبة ولا بديل لها — لن يُنادى مساعد الدعم';
  end if;
end $$;

create or replace function app.dispatch_support_agent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'support_agent_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'support_agent_secret' limit 1;

  -- ★ غياب السرّ ليس خطأً يُسقط إدراج الرسالة: التذكرة أهمّ من المساعد.
  if v_url is null or v_secret is null then
    raise warning 'AI_SUPPORT_DISPATCH: سرّ Vault ناقص — لم يُنادَ المساعد';
    return null;
  end if;

  perform net.http_post(
    url     => v_url,
    body    => jsonb_build_object(
                 'table',  'support_messages',
                 'record', jsonb_build_object('ticket_id', new.ticket_id)),
    headers => jsonb_build_object(
                 'content-type',     'application/json',
                 'x-support-secret', v_secret,
                 -- مفتاح anon عامّ (في كل متصفّح) — جوازُ مشغّل الدوالّ
                 -- لا جدارٌ؛ الجدار هو x-support-secret أعلاه.
                 'authorization',    'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4bmFyYWlxcWdtaG5pZGJvdXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5OTcxMDEsImV4cCI6MjEwNTU3MzEwMX0.PpQCbGWHCRh_hXOuyYfP7ktaLlyesbRhflwpeHq2PYE'),
    timeout_milliseconds => 5000
  );
  return null;
exception
  when others then
    raise warning 'AI_SUPPORT_DISPATCH: % — لم يُنادَ المساعد', sqlerrm;
    return null;
end $$;

comment on function app.dispatch_support_agent() is
  'يوقظ support-agent عند رسالة من صاحب التذكرة. السرّ من Vault، '
  'والنداء غير متزامن، ولا يُسقط إدراج الرسالة أبدًا (0074).';

drop trigger if exists support_messages_dispatch_agent on public.support_messages;

create trigger support_messages_dispatch_agent
  after insert on public.support_messages
  for each row
  when (new.author_kind = 'requester')
  execute function app.dispatch_support_agent();

-- ═══════════════════════════════════════════════════════════════════
-- زرعُ السرَّين — **يدويًّا مرّة واحدة، لا في هذه الهجرة**:
--
--   select vault.create_secret(
--     'https://<ref>.supabase.co/functions/v1/support-agent',
--     'support_agent_url', 'رابط دالّة مساعد الدعم');
--   select vault.create_secret(
--     '<SUPPORT_WEBHOOK_SECRET>',
--     'support_agent_secret', 'سرّ ترويسة x-support-secret');
--
-- وللتدوير: `select vault.update_secret(id, '<new>')` ثم بدّل السرّ
-- نفسه في أسرار الدوالّ الطرفية. ويسري على الدالّة عند أوّل إقلاع
-- بارد — فالمتغيّرات تُحقَن لحظة الإقلاع لا عند كل طلب.
-- ═══════════════════════════════════════════════════════════════════
