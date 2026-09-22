-- =====================================================================
-- 0037 نصوص المنصة القانونية (إضافية · لا تمسّ ما سبق)
--
-- ★ المشكلة: صفحة التسجيل تقول «بإنشائك حسابًا فأنت توافق على الشروط
-- وسياسة الخصوصية» وتربطهما بـ`/legal/terms` و`/legal/privacy` —
-- وكلاهما 404. المستخدم يُطالَب بالموافقة على نصّ لا يستطيع قراءته.
--
-- ★ والنص لا يُخترع هنا: هذه وثائق يكتبها مالك المنصة بمسؤوليته،
-- تمامًا كما لا يُخترع نصّ سياسة شحن للتاجر (نفس القاعدة في
-- `/sites/[host]/pages/[slug]`). الصفحة تعرض ما كُتب، وتقول بصراحة
-- «لم تُنشر بعد» حين لا يوجد — لا تعرض نصًّا افتراضيًا كأنه سياسة
-- المنصة.
--
-- D32 يوجب توثيق نطاق إخفاء الهوية في سياسة الخصوصية.
-- =====================================================================

alter table public.platform_settings
  add column if not exists legal jsonb not null default '{}'::jsonb;

comment on column public.platform_settings.legal is
  'نصوص قانونية بالمفتاح: terms · privacy · subscription · cancellation. '
  'يكتبها مالك المنصة من /admin/settings؛ لا نص افتراضي.';

-- ---------------------------------------------------------------------
-- القراءة العامة: الزائر يحتاج الشروط قبل أن يملك حسابًا، و
-- `platform_settings` مقفلة على موظفي المنصة. دالة ضيّقة تُرجع النصّ
-- المطلوب وحده — لا بقيّة الإعدادات (حسابات البنوك · بوابة الإطلاق).
-- ---------------------------------------------------------------------
create or replace function public.legal_document(p_slug text)
returns table (slug text, title text, body text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_titles constant jsonb := jsonb_build_object(
    'terms',        'الشروط والأحكام',
    'privacy',      'سياسة الخصوصية',
    'subscription', 'سياسة الاشتراك',
    'cancellation', 'سياسة الإلغاء والاسترداد');
  v_slug text := lower(trim(coalesce(p_slug, '')));
  s public.platform_settings%rowtype;
begin
  if not (v_titles ? v_slug) then
    return;                      -- مفتاح غير معروف ⇒ لا صف ⇒ 404
  end if;

  select * into s from public.platform_settings where id;

  return query select
    v_slug,
    v_titles ->> v_slug,
    nullif(trim(coalesce(s.legal ->> v_slug, '')), ''),
    s.updated_at;
end;
$$;

revoke execute on function public.legal_document(text) from public;
grant   execute on function public.legal_document(text) to anon, authenticated;
