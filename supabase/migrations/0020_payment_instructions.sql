-- =====================================================================
-- 0020 بيانات التحويل للزبون (إضافية · لا تمسّ ما سبق)
--
-- `store_payment_settings` مفصول عن `store_settings` لأن سياسات RLS
-- تعمل على الصف لا على العمود (0003): قراءة عامة لصف الإعدادات كانت
-- ستكشف `bank_accounts` للجميع.
--
-- لكن الزبون الذي طلب بتحويل بنكي **يحتاج** رقم الحساب ليحوّل. هذه
-- الدالة تفتح ذلك القدر بالضبط، ولمن أثبت صلته بطلب تحويل قائم فقط:
--   * الطلب موجود في هذا المتجر،
--   * وطريقة دفعه تحويل (لا الدفع عند الاستلام)،
--   * ولم يُلغَ،
--   * وأثبت صلته بتوكن الطلب أو برقم الهاتف.
-- =====================================================================

create or replace function public.order_payment_instructions(
  p_store_id     uuid,
  p_order_number text,
  p_guest_token  text default null,
  p_phone        text default null
)
returns table (bank_accounts jsonb, bankak_number text, amount_due numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  o public.orders%rowtype;
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if coalesce(trim(p_order_number), '') = '' then
    return;
  end if;

  select * into o from public.orders
   where store_id = p_store_id
     and upper(trim(order_number)) = upper(trim(p_order_number));
  if not found then return; end if;

  if o.payment_method not in ('bank_transfer', 'bankak') then return; end if;
  if o.status = 'cancelled' then return; end if;

  if not (
    (coalesce(trim(p_guest_token), '') <> '' and o.guest_token = p_guest_token)
    or (length(v_digits) >= 7
        and right(regexp_replace(coalesce(o.contact_phone, ''), '\D', '', 'g'), 9)
          = right(v_digits, 9))
    or (o.customer_id is not null
        and o.customer_id = app.current_customer_id(p_store_id))
  ) then
    return;
  end if;

  return query
  select
    -- الحساب البنكي المعلن للزبائن فقط: لا ملاحظات تحويل داخلية
    coalesce(s.bank_accounts, '[]'::jsonb),
    case when o.payment_method = 'bankak' then s.bankak_number else null end,
    app.money(greatest(o.total - o.paid_total, 0))
  from public.store_payment_settings s
  where s.store_id = p_store_id;
end;
$$;

revoke execute on function public.order_payment_instructions(uuid, text, text, text)
  from public;
grant execute on function public.order_payment_instructions(uuid, text, text, text)
  to anon, authenticated;
