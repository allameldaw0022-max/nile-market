-- =====================================================================
-- 0025 تسجيل زيارة الإحالة (إضافية · لا تمسّ ما سبق)
--
-- `referral_visits` بلا سياسة INSERT لأي دور (0010) عن قصد: الزيارة
-- تُسجَّل خادميًا لا من المتصفح، لأنها تحدّد من يقبض العمولة لاحقًا
-- (D19). هذه الدالة هي المنفذ الوحيد، وفيها:
--
--   * الكود يُطابَق على شريك **نشط** فقط — كود قديم أو موقوف لا يُسجَّل.
--   * التوكن يُولَّد خادميًا (كوكي HttpOnly) ولا يقبله المتصفح.
--   * الـIP يُجزَّأ ولا يُخزَّن خامًا (SECURITY.md §16.11).
--   * زيارة واحدة لكل (توكن · شريك) في الساعة — نافذة الإسناد
--     Last-touch لا تتأثر، والجدول لا يُغرَق بإعادة التحميل.
-- =====================================================================

create or replace function public.record_referral_visit(
  p_code          text,
  p_visitor_token text,
  p_landing_path  text default null,
  p_ip            text default null,
  p_user_agent    text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_partner uuid;
begin
  if coalesce(trim(p_code), '') = '' or coalesce(trim(p_visitor_token), '') = '' then
    return false;
  end if;
  -- توكن قصير علامة على عبث: التوكنات الحقيقية 32 بايت سُداسية
  if length(p_visitor_token) < 24 or length(p_visitor_token) > 128 then
    return false;
  end if;

  select id into v_partner from public.partners
   where upper(referral_code) = upper(trim(p_code)) and status = 'active';
  if v_partner is null then
    return false;
  end if;

  if exists (
    select 1 from public.referral_visits
    where visitor_token = p_visitor_token
      and partner_id = v_partner
      and created_at > now() - interval '1 hour'
  ) then
    return true;   -- مسجَّلة سلفًا: النتيجة نفسها بلا صف جديد
  end if;

  insert into public.referral_visits
    (partner_id, visitor_token, landing_path, ip_hash, user_agent)
  values (v_partner, p_visitor_token, left(nullif(trim(p_landing_path), ''), 200),
          app.hash_ip(p_ip), left(nullif(trim(p_user_agent), ''), 300));

  return true;
end;
$$;

revoke execute on function public.record_referral_visit(text, text, text, text, text)
  from public;
grant execute on function public.record_referral_visit(text, text, text, text, text)
  to anon, authenticated;
