-- =====================================================================
-- 0028 مراجعات الإدارة (إضافية · لا تمسّ ما سبق)
--
-- مساران ماليان يحتاجان قرار موظف منصة:
--   * طلب اشتراك: اعتماد يُفعِّل الاشتراك ويقيّد إيرادًا وعمولة شريك.
--   * طلب صرف شريك: تسجيل ثم اعتماد من شخصين مختلفين (D30).
--
-- ★ فصل المهام مفروض بقيد CHECK في `partner_payouts` (0010)، لا في
-- هذه الدوال ولا في الواجهة. الدوال تُسهّل الاستدعاء ولا تحلّ محلّ
-- القيد: تجاوز RLS لا يتجاوز CHECK.
-- =====================================================================

create or replace function public.review_subscription_request(
  p_request_id uuid,
  p_action     text,            -- 'approve' | 'reject'
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r          public.subscription_requests%rowtype;
  v_store    public.stores%rowtype;
  v_plan     public.plans%rowtype;
  v_payment  uuid;
  v_email    text;
  v_sub      public.subscriptions%rowtype;
begin
  if not app.has_platform_permission('subscriptions', 'approve') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'VALIDATION: إجراء غير معروف' using errcode = 'P0001';
  end if;

  select * into r from public.subscription_requests
   where id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND: الطلب غير موجود' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'VALIDATION: الطلب تمت مراجعته مسبقًا' using errcode = 'P0001';
  end if;

  select * into v_store from public.stores where id = r.store_id;
  select * into v_plan  from public.plans  where id = r.plan_id;

  if p_action = 'reject' then
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'REASON_REQUIRED: سبب الرفض إلزامي' using errcode = 'P0001';
    end if;

    update public.subscription_requests
       set status = 'rejected', rejection_reason = trim(p_reason),
           reviewed_by = (select auth.uid()), reviewed_at = now()
     where id = p_request_id;

    perform app.notify(v_store.owner_id, 'subscription.rejected',
      'لم نتمكّن من اعتماد طلب اشتراكك', trim(p_reason),
      '/dashboard/subscription', r.store_id, 'sub.rejected:' || r.id::text);

    return jsonb_build_object('status', 'rejected');
  end if;

  -- الاعتماد يمر بـ`record_payment`: هي من يقيّد الدفعة ويمدّد
  -- الاشتراك ويكتب إيراد المنصة ويُنشئ عمولة الشريك، كلها في معاملة
  -- واحدة. تكرار منطقها هنا كان سيفتح باب اختلافهما.
  v_payment := public.record_payment(
    'subscription', p_request_id, 'bank_transfer', r.net_amount,
    r.reference, r.proof_media_id, 'subreq:' || r.id::text);

  v_sub := app.store_subscription(r.store_id);

  perform app.notify(v_store.owner_id, 'subscription.approved',
    'تم تفعيل اشتراكك في باقة ' || v_plan.name, null,
    '/dashboard/subscription', r.store_id, 'sub.approved:' || r.id::text);

  select contact_email into v_email from public.store_settings
   where store_id = r.store_id;

  perform app.queue_email(v_email, 'subscription_approved',
    jsonb_build_object(
      'store_name', v_store.name,
      'plan_name',  v_plan.name,
      'ends_at',    to_char(v_sub.current_period_end, 'YYYY-MM-DD')),
    'sub_approved:' || r.id::text);

  return jsonb_build_object('status', 'approved', 'payment_id', v_payment);
end;
$$;

revoke execute on function public.review_subscription_request(uuid, text, text)
  from public, anon;
grant execute on function public.review_subscription_request(uuid, text, text)
  to authenticated;

-- =====================================================================
-- مراجعة طلب صرف شريك (D30)
--
-- ثلاث خطوات بثلاثة أشخاص محتملين:
--   1) الشريك يبادر (`initiated_by`) — تمّت في request_partner_payout.
--   2) موظف يسجّل الطلب إداريًا (`requested_by`).
--   3) موظف **آخر** يعتمد (`approved_by`) ثم يُصرف.
--
-- القيود في الجدول ترفض تطابق أي اثنين منهم، وتسري على service_role.
-- =====================================================================
create or replace function public.review_payout(
  p_payout_id uuid,
  p_action    text,            -- 'record' | 'approve' | 'reject'
  p_reason    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p        public.partner_payouts%rowtype;
  v_actor  uuid := (select auth.uid());
  v_partner public.partners%rowtype;
begin
  if p_action not in ('record', 'approve', 'reject') then
    raise exception 'VALIDATION: إجراء غير معروف' using errcode = 'P0001';
  end if;

  select * into p from public.partner_payouts where id = p_payout_id for update;
  if not found then
    raise exception 'NOT_FOUND: الطلب غير موجود' using errcode = 'P0002';
  end if;
  if p.status = 'paid' then
    raise exception 'VALIDATION: الطلب مصروف بالفعل' using errcode = 'P0001';
  end if;

  select * into v_partner from public.partners where id = p.partner_id;

  if p_action = 'record' then
    if not app.has_platform_permission('payouts', 'edit') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if p.requested_by is not null then
      raise exception 'VALIDATION: الطلب مسجَّل مسبقًا' using errcode = 'P0001';
    end if;

    update public.partner_payouts
       set requested_by = v_actor, status = 'pending_review',
           note = coalesce(nullif(trim(p_reason), ''), note)
     where id = p_payout_id;

    return jsonb_build_object('status', 'pending_review');
  end if;

  if not app.has_platform_permission('payouts', 'approve') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_action = 'reject' then
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'REASON_REQUIRED: سبب الرفض إلزامي' using errcode = 'P0001';
    end if;

    update public.partner_payouts
       set status = 'rejected', rejected_reason = trim(p_reason)
     where id = p_payout_id;

    perform app.notify(v_partner.profile_id, 'payout.rejected',
      'لم يُعتمد طلب الصرف', trim(p_reason), '/partner', null,
      'payout.rejected:' || p.id::text);
    perform app.queue_email(v_partner.email, 'payout_status',
      jsonb_build_object('amount', p.amount, 'status_label', 'مرفوض',
                         'reason', trim(p_reason)),
      'payout_rejected:' || p.id::text);

    return jsonb_build_object('status', 'rejected');
  end if;

  -- approve
  if p.requested_by is null then
    raise exception 'SOD_ORDER: لا اعتماد قبل تسجيل الطلب إداريًا'
      using errcode = 'P0001';
  end if;

  -- الفحص هنا لرسالة واضحة؛ القيد في الجدول هو الحاجز الفعلي
  if p.requested_by = v_actor then
    raise exception 'SOD_SAME_ACTOR: لا يعتمد مَن سجّل الطلب' using errcode = '42501';
  end if;
  if p.initiated_by = v_actor then
    raise exception 'SOD_SAME_ACTOR: لا يعتمد مَن بادر بالطلب' using errcode = '42501';
  end if;

  update public.partner_payouts
     set status = 'approved', approved_by = v_actor, approved_at = now()
   where id = p_payout_id;

  perform app.notify(v_partner.profile_id, 'payout.approved',
    'اعتُمد طلب الصرف وسيُحوَّل قريبًا', null, '/partner', null,
    'payout.approved:' || p.id::text);

  return jsonb_build_object('status', 'approved');
end;
$$;

revoke execute on function public.review_payout(uuid, text, text) from public, anon;
grant   execute on function public.review_payout(uuid, text, text) to authenticated;

-- =====================================================================
-- إيقاف متجر وإعادة تفعيله (المواصفات §20: المتجر يُغلق ولا يُحذف)
-- =====================================================================
create or replace function public.set_store_status(
  p_store_id uuid,
  p_status   public.store_status,
  p_reason   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare s public.stores%rowtype;
begin
  if not app.has_platform_permission('stores', 'edit') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended', 'closed', 'pending_review') then
    raise exception 'VALIDATION: حالة غير مسموحة' using errcode = 'P0001';
  end if;

  select * into s from public.stores where id = p_store_id;
  if not found then
    raise exception 'NOT_FOUND: المتجر غير موجود' using errcode = 'P0002';
  end if;
  if p_status = 'suspended' and coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED: سبب الإيقاف إلزامي' using errcode = 'P0001';
  end if;

  update public.stores
     set status = p_status,
         suspended_reason = case when p_status = 'suspended'
                                 then trim(p_reason) else null end,
         suspended_at = case when p_status = 'suspended' then now() else null end
   where id = p_store_id;

  perform app.notify(s.owner_id, 'store.status',
    case p_status
      when 'suspended' then 'أُوقف متجرك مؤقتًا'
      when 'closed'    then 'أُغلق متجرك'
      when 'active'    then 'أُعيد تفعيل متجرك'
      else 'تغيّرت حالة متجرك'
    end,
    nullif(trim(p_reason), ''), '/dashboard', p_store_id, null);
end;
$$;

revoke execute on function public.set_store_status(uuid, public.store_status, text)
  from public, anon;
grant execute on function public.set_store_status(uuid, public.store_status, text)
  to authenticated;

-- =====================================================================
-- لوحة أرقام الإدارة — استعلام واحد بدل عشرة من الواجهة
-- =====================================================================
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not app.has_platform_permission('dashboard', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'stores_total',    (select count(*) from public.stores where deleted_at is null),
    'stores_active',   (select count(*) from public.stores
                         where status = 'active' and deleted_at is null),
    'stores_new_30d',  (select count(*) from public.stores
                         where created_at >= now() - interval '30 days'),
    'subs_active',     (select count(*) from public.subscriptions where status = 'active'),
    'subs_expiring',   (select count(*) from public.subscriptions
                         where status in ('expiring', 'grace')),
    'subs_expired',    (select count(*) from public.subscriptions where status = 'expired'),
    'requests_pending',(select count(*) from public.subscription_requests
                         where status = 'pending'),
    'payouts_pending', (select count(*) from public.partner_payouts
                         where status in ('submitted', 'pending_review', 'approved')),
    'tickets_open',    (select count(*) from public.support_tickets
                         where status not in ('resolved', 'closed')),
    'revenue_30d',     (select coalesce(sum(amount), 0) from public.payments
                         where kind = 'subscription' and status = 'paid'
                           and created_at >= now() - interval '30 days'),
    'orders_30d',      (select count(*) from public.orders
                         where created_at >= now() - interval '30 days'),
    'partners_active', (select count(*) from public.partners where status = 'active')
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_overview() from public, anon;
grant   execute on function public.admin_overview() to authenticated;
