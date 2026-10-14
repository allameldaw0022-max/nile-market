-- ═══════════════════════════════════════════════════════════════════
-- قراءة السعة: المجدول يقرؤها كما يكتبها.
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★★ العطل: `/api/v1/health` يعلن `degraded` **دائمًا** منذ 0055.
-- فحص الصحّة يعمل بـ`service_role` (بلا هويّة)، و`capacity_latest`
-- تشترط `has_platform_permission('system_health','view')` فترفضه في
-- كل نداء ⇒ يُسجَّل «تعذّرت قراءة السعة» ⇒ `degraded` أبديّ.
--
-- ★★ وهذا أسوأ من عطلٍ صريح: جرس إنذارٍ يرنّ بلا سبب شهرًا كاملًا
-- يُفقد معناه، فحين يرنّ لسببٍ حقيقيّ لا يصدّقه أحد. ولا يميّز مراقبٌ
-- خارجيّ بين ضغطٍ يتشكّل وبين هذا الصمت.
--
-- ★ والتناقض داخل الهجرة نفسها: `record_capacity` — أختها في 0055 —
-- تسمح للمجدول صراحةً («المجدول يعمل بلا هويّة، والموظّف بهويّته»)،
-- و`capacity_latest` تسمح للموظّف وحده. فالإصلاح توحيدُ الحارسَين على
-- شكلٍ واحد لا اختراع شكلٍ ثالث.
--
-- ★ ولمَ السماحُ بهويّةٍ معدومة آمن: `anon` ممنوع من التنفيذ أصلًا،
-- فلا يبقى بلا هويّة إلا `service_role` — مفتاحٌ خادميّ لا يصل
-- متصفّحًا. والمنحة هي الجدار، كما في `record_capacity` حرفيًّا.
--   ولا بيان مستأجر هنا: مقاييس بنيةٍ تحتية (اتصالات · أقفال · نِسَب).
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.capacity_latest()
returns table (
  metric      text,
  value       numeric,
  limit_value numeric,
  pct         numeric,
  level       text,
  detail      jsonb,
  measured_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- نفس حارس `record_capacity`: المجدول بلا هويّة، والموظّف بهويّته.
  if (select auth.uid()) is not null
     and not app.has_platform_permission('system_health', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select distinct on (s.metric)
           s.metric, s.value, s.limit_value, s.pct, s.level, s.detail, s.measured_at
      from public.capacity_samples s
     order by s.metric, s.measured_at desc;
end;
$$;

revoke execute on function public.capacity_latest() from public, anon;
grant   execute on function public.capacity_latest() to authenticated, service_role;

comment on function public.capacity_latest() is
  'أحدث قراءة لكل مقياس سعة. يقرؤها المجدول (service_role بلا هويّة) '
  'وموظّف المنصّة بصلاحية system_health:view. `anon` ممنوع — المنحة هي الجدار.';
