-- =====================================================================
-- 0017 عرض فريق المتجر (إضافية · لا تمسّ ما سبق)
--
-- المشكلة: شاشات المتجر تحتاج **اسم** من نفّذ الإجراء (حركة مخزون،
-- تغيير حالة طلب، ملاحظة دعم)، و`profiles` لا تُقرأ إلا لصاحبها أو
-- لموظف المنصة. النتيجة بلا حل: أسماء فارغة في كل سجل.
--
-- الحل المختار: عرض ضيّق يكشف الاسم والصورة فقط، ببوابة صلاحية في
-- جسمه، بدل توسيع سياسات `profiles` لتكشف الصف كله (هاتف · حالة
-- حساب · تواريخ) لكل زميل.
--
-- ملاحظة أمنية: العرض ليس `security_invoker`، فهو يتجاوز RLS على
-- `profiles` عن قصد — والبوابة هي شرط WHERE أدناه. لذلك:
--   * SELECT فقط، ولا منح كتابة لأي دور.
--   * security_barrier يمنع تسريب الصفوف عبر دوال في شرط المستدعي.
-- =====================================================================

create or replace view public.store_team
with (security_barrier = true) as
select
  m.store_id,
  m.profile_id,
  m.role,
  m.status,
  p.full_name,
  p.avatar_url
from public.store_members m
join public.profiles p on p.id = m.profile_id
where m.deleted_at is null
  and (
    m.profile_id = (select auth.uid())
    or app.has_store_permission(m.store_id, 'members:view')
    or app.has_platform_permission('employees', 'view')
  );

revoke all on public.store_team from public, anon;
grant select on public.store_team to authenticated;
