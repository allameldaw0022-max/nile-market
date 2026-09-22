-- =====================================================================
-- 0023 طلبات الاشتراك وطلبات صرف الشريك (إضافية · لا تمسّ ما سبق)
--
-- المبلغ لا يأتي من المتصفح في أي منهما:
--   * طلب الاشتراك يقرأ سعر الباقة من `plans`.
--   * طلب الصرف يُقاس على الرصيد المتاح في `partner_balances`.
--
-- D18 محترَم: باقة لم يُضبَط سعرها صراحةً (`price_configured_at is
-- null`) لا تُباع — ولا نفترض لها سعرًا.
-- =====================================================================

-- `request_status` كان ('pending','approved','rejected'). سحب التاجر
-- لطلبه ليس رفضًا من الإدارة، وخلطهما يُفسد تقارير المراجعة — فتُضاف
-- قيمة جديدة إضافةً لا استبدالًا.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'request_status' and e.enumlabel = 'cancelled'
  ) then
    alter type public.request_status add value 'cancelled';
  end if;
end $$;

create or replace function public.submit_subscription_request(
  p_store_id        uuid,
  p_plan_id         uuid,
  p_reference       text default null,
  p_proof_media_id  uuid default null,
  p_idempotency_key text default null
)
returns table (request_id uuid, net_amount numeric)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_key   text := coalesce(nullif(trim(p_idempotency_key), ''), app.random_token(16));
  v_plan  public.plans%rowtype;
  v_exist public.subscription_requests%rowtype;
  v_id    uuid;
begin
  if not app.has_store_permission(p_store_id, 'subscription:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- نفس المفتاح ⇒ نفس الطلب، لا طلب ثانٍ (§13)
  select * into v_exist from public.subscription_requests
   where idempotency_key = v_key;
  if found then
    return query select v_exist.id, v_exist.net_amount;
    return;
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if not found or not v_plan.is_active then
    raise exception 'NOT_FOUND: الباقة غير متاحة' using errcode = 'P0002';
  end if;
  if not v_plan.is_public then
    raise exception 'NOT_FOUND: الباقة غير متاحة' using errcode = 'P0002';
  end if;
  if v_plan.is_free then
    raise exception 'VALIDATION: الباقة المجانية لا تحتاج طلب اشتراك'
      using errcode = 'P0001';
  end if;
  -- D18: لا سعر مفترض. باقة بلا سعر مضبوط لا تُباع.
  if v_plan.price_configured_at is null then
    raise exception 'VALIDATION: لم يُضبط سعر هذه الباقة بعد — تواصل مع الدعم'
      using errcode = 'P0001';
  end if;

  -- طلب معلّق واحد لكل متجر: طلبان معلّقان يعنيان اعتمادين ودفعتين
  if exists (
    select 1 from public.subscription_requests
    where store_id = p_store_id and status = 'pending'
  ) then
    raise exception 'REQUEST_PENDING: لديك طلب اشتراك قيد المراجعة'
      using errcode = 'P0001';
  end if;

  -- إثبات التحويل، إن أُرسل، يجب أن يكون ملف هذا المتجر ولغرضه
  if p_proof_media_id is not null and not exists (
    select 1 from public.media_files m
    where m.id = p_proof_media_id
      and m.store_id = p_store_id
      and m.purpose = 'payment_proof'
      and m.deleted_at is null
  ) then
    raise exception 'INVALID_MEDIA: إثبات التحويل غير صالح' using errcode = 'P0001';
  end if;

  insert into public.subscription_requests
    (store_id, plan_id, amount, discount_amount, net_amount,
     reference, proof_media_id, status, idempotency_key)
  values (p_store_id, p_plan_id, app.money(v_plan.price), 0,
          app.money(v_plan.price), nullif(trim(p_reference), ''),
          p_proof_media_id, 'pending', v_key)
  returning id into v_id;

  return query select v_id, app.money(v_plan.price);
end;
$$;

revoke execute on function public.submit_subscription_request(uuid, uuid, text, uuid, text)
  from public, anon;
grant execute on function public.submit_subscription_request(uuid, uuid, text, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- سحب طلب اشتراك معلّق. المعتمَد لا يُسحب — صار له دفعة وسجل.
-- ---------------------------------------------------------------------
create or replace function public.cancel_subscription_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.subscription_requests%rowtype;
begin
  select * into r from public.subscription_requests where id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND: الطلب غير موجود' using errcode = 'P0002';
  end if;
  if not app.has_store_permission(r.store_id, 'subscription:manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'VALIDATION: لا يُسحب طلب تمت مراجعته' using errcode = 'P0001';
  end if;

  update public.subscription_requests
     set status = 'cancelled', reviewed_at = now()
   where id = p_request_id;
end;
$$;

revoke execute on function public.cancel_subscription_request(uuid) from public, anon;
grant   execute on function public.cancel_subscription_request(uuid) to authenticated;

-- =====================================================================
-- طلب صرف عمولة الشريك (D30: الشريك يطلب · موظف يسجّل · آخر يعتمد)
--
-- المبلغ يُقاس على الرصيد المتاح المحسوب في `partner_balances`، فلا
-- يطلب شريك أكثر مما استحق ولو أرسل رقمًا أكبر.
-- =====================================================================
create or replace function public.request_partner_payout(
  p_amount          numeric,
  p_note            text default null,
  p_idempotency_key text default null
)
returns table (payout_id uuid, amount numeric)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_key       text := coalesce(nullif(trim(p_idempotency_key), ''), app.random_token(16));
  v_partner   uuid := app.current_partner_id();
  v_available numeric(14,2);
  v_pending   numeric(14,2);
  v_amount    numeric(14,2) := app.money(p_amount);
  v_exist     public.partner_payouts%rowtype;
  v_id        uuid;
begin
  if v_partner is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_exist from public.partner_payouts where idempotency_key = v_key;
  if found then
    return query select v_exist.id, v_exist.amount;
    return;
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'INVALID_AMOUNT: أدخل مبلغًا أكبر من صفر' using errcode = 'P0001';
  end if;

  -- المتاح = العمولات الموسومة `payable`. المعكوسة والمدفوعة خارجها.
  select coalesce(b.payable, 0) into v_available
    from public.partner_balances b where b.partner_id = v_partner;

  -- الطلبات المعلّقة محجوزة من الرصيد: طلبان بنفس الرصيد = صرف مزدوج
  select coalesce(sum(amount), 0) into v_pending
    from public.partner_payouts
   where partner_id = v_partner and status in ('submitted', 'approved');

  if v_amount > coalesce(v_available, 0) - v_pending then
    raise exception 'INSUFFICIENT_BALANCE: المبلغ يتجاوز رصيدك المتاح'
      using errcode = 'P0001';
  end if;

  insert into public.partner_payouts
    (partner_id, amount, status, initiated_by, initiated_by_kind, note, idempotency_key)
  values (v_partner, v_amount, 'submitted', (select auth.uid()), 'partner',
          nullif(trim(p_note), ''), v_key)
  returning id into v_id;

  return query select v_id, v_amount;
end;
$$;

revoke execute on function public.request_partner_payout(numeric, text, text)
  from public, anon;
grant execute on function public.request_partner_payout(numeric, text, text)
  to authenticated;
