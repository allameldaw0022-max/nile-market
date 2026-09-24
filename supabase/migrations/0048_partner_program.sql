-- =====================================================================
-- 0048 برنامج الشركاء: رقم قصير · بيانات الاستلام · حجز وصرف
--
-- ★ لا نظام جديد. كل شيء هنا امتداد لما في 0010/0023/0028:
--   `partners` · `referrals` · `referral_visits` · `commission_ledger`
--   · `partner_payouts` · `attribute_referral` ·
--   `app.post_commission_for_payment` · `review_payout` ·
--   `mark_payout_paid` · `app.notify`.
--
-- ما يضيفه:
--   ١) رقم تسلسلي ثابت لكل شريك ⇒ رابط قصير، ولا UUID في رابط ظاهر.
--   ٢) بيانات استلام الأرباح على `partners` نفسه (لا جدول جديد).
--   ٣) حجز العمولات داخل معاملة واحدة عند طلب الصرف، وفكّه عند
--      الرفض أو السحب — فلا يُصرف نفس القيد مرتين.
--   ٤) لقطة بيانات الاستلام في الطلب: تغيير الحساب لاحقًا لا يغيّر
--      طلبًا قديمًا.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ١) رقم الشريك التسلسلي + بيانات الاستلام
--
-- ★ متتالية لا `max()+1`: الأخيرة تتصادم عند التسجيل المتزامن.
-- ★ المتتالية لا تُعيد رقمًا استُهلك ⇒ رقم شريك موقوف لا يُمنح لغيره.
-- ---------------------------------------------------------------------
create sequence if not exists public.partner_serial_seq as integer start with 1;

alter table public.partners
  add column if not exists serial_no          integer,
  add column if not exists payout_method      text,
  add column if not exists payout_beneficiary text,
  add column if not exists payout_bank        text,
  add column if not exists payout_account     text,
  add column if not exists payout_phone       text;

-- الشركاء القائمون يأخذون أرقامهم بترتيب إنشائهم
do $$
declare r record;
begin
  for r in select id from public.partners where serial_no is null order by created_at loop
    update public.partners
       set serial_no = nextval('public.partner_serial_seq')
     where id = r.id;
  end loop;
end $$;

alter table public.partners
  alter column serial_no set default nextval('public.partner_serial_seq');

create unique index if not exists partners_serial_unique
  on public.partners (serial_no);

comment on column public.partners.serial_no is
  'رقم الشريك القصير — ثابت ولا يُعاد استخدامه. أساس رابط الإحالة القصير.';

-- ---------------------------------------------------------------------
-- حارس أعمدة الشريك.
--
-- كان يحرس النسبة وحدها (0010). الآن يحرس معها ما لا يجوز أن يتغيّر
-- إطلاقًا: الرقم التسلسلي ورمز الإحالة — رابط منشور لا يُسحب من
-- تحت من نشره، ولا يُعاد توجيهه إلى شريك آخر.
-- ---------------------------------------------------------------------
create or replace function app.protect_partner_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.commission_rate is distinct from old.commission_rate
     and not app.has_platform_permission('commissions', 'manage') then
    raise exception 'RATE_PROTECTED: نسبة العمولة يعدّلها Admin بصلاحية commissions:manage فقط'
      using errcode = '42501';
  end if;
  -- ثابتان لأي أحد، بأي صلاحية: الرابط المنشور عهد
  new.serial_no     := old.serial_no;
  new.referral_code := old.referral_code;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- بيانات استلام الأرباح — يكتبها الشريك لنفسه فقط.
--
-- ★ لا سياسة UPDATE ذاتية على `partners`: صفّ الشريك يحمل نسبته
-- ورقمه وحالته، وفتح تعديله له يعني فتح تلك كلها. المنفذ دالة
-- تكتب هذه الحقول الستة لا غير.
--
-- ★ الوسائل المدعومة هي وسائل المنصة نفسها: تحويل بنكي أو بنكك.
-- ---------------------------------------------------------------------
create or replace function public.save_partner_payout_account(
  p_method      text,
  p_beneficiary text,
  p_bank        text default null,
  p_account     text default null,
  p_phone       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_partner uuid := app.current_partner_id();
begin
  if v_partner is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_method not in ('bank_transfer', 'bankak') then
    raise exception 'VALIDATION: وسيلة استلام غير مدعومة' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_beneficiary, ''))) < 3 then
    raise exception 'VALIDATION: اسم المستفيد مطلوب' using errcode = 'P0001';
  end if;
  if p_method = 'bank_transfer' then
    if length(trim(coalesce(p_bank, ''))) < 2 then
      raise exception 'VALIDATION: اسم البنك مطلوب' using errcode = 'P0001';
    end if;
    if length(regexp_replace(coalesce(p_account, ''), '\s', '', 'g')) < 6 then
      raise exception 'VALIDATION: رقم الحساب مطلوب' using errcode = 'P0001';
    end if;
  else
    if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 9 then
      raise exception 'VALIDATION: رقم هاتف بنكك مطلوب' using errcode = 'P0001';
    end if;
  end if;

  update public.partners
     set payout_method      = p_method,
         payout_beneficiary = trim(p_beneficiary),
         payout_bank        = nullif(trim(coalesce(p_bank, '')), ''),
         payout_account     = nullif(trim(coalesce(p_account, '')), ''),
         payout_phone       = nullif(trim(coalesce(p_phone, '')), '')
   where id = v_partner;
end;
$$;

revoke execute on function public.save_partner_payout_account(text, text, text, text, text)
  from public, anon;
grant execute on function public.save_partner_payout_account(text, text, text, text, text)
  to authenticated;

-- بيانات الاستلام كما يراها صاحبها. (الإدارة تراها في لقطة الطلب.)
create or replace function public.partner_payout_account()
returns table (
  method text, beneficiary text, bank text, account text, phone text,
  is_complete boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_partner uuid := app.current_partner_id();
  p public.partners%rowtype;
begin
  if v_partner is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into p from public.partners where id = v_partner;

  return query select
    p.payout_method, p.payout_beneficiary, p.payout_bank,
    p.payout_account, p.payout_phone,
    app.partner_payout_ready(p.id);
end;
$$;

revoke execute on function public.partner_payout_account() from public, anon;
grant   execute on function public.partner_payout_account() to authenticated;

-- اكتمال بيانات الاستلام — تعريف واحد يستعمله الزرّ والدالة معًا،
-- فلا تختلف الواجهة عن القاعدة في معنى «مكتملة».
create or replace function app.partner_payout_ready(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p.payout_method
      when 'bank_transfer' then
        coalesce(length(trim(p.payout_beneficiary)), 0) >= 3
        and coalesce(length(trim(p.payout_bank)), 0) >= 2
        and coalesce(length(trim(p.payout_account)), 0) >= 6
      when 'bankak' then
        coalesce(length(trim(p.payout_beneficiary)), 0) >= 3
        and coalesce(length(regexp_replace(coalesce(p.payout_phone, ''), '\D', '', 'g')), 0) >= 9
      else false
    end
    from public.partners p where p.id = p_partner_id
  ), false);
$$;

grant execute on function app.partner_payout_ready(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- ٢) لقطة بيانات الاستلام داخل الطلب
-- ---------------------------------------------------------------------
alter table public.partner_payouts
  add column if not exists account_snapshot jsonb,
  add column if not exists proof_media_id uuid
    references public.media_files (id) on delete set null,
  add column if not exists transferred_at timestamptz;

comment on column public.partner_payouts.account_snapshot is
  'بيانات الاستلام وقت الطلب — لا تتغيّر بتغيير الشريك لحسابه لاحقًا.';

-- ---------------------------------------------------------------------
-- ٣) الرصيد: متاح · محجوز · مدفوع
--
-- ★ «المتاح» يطرح قيود العكس غير المرتبطة بصرف: استرداد بعد صرف
-- يترك دينًا مفتوحًا يُخصم من عمولات قادمة بدل أن يضيع.
-- الشكل تغيّر ⇒ إسقاط وإنشاء، والمنح يُعاد بعده (0040).
-- ---------------------------------------------------------------------
drop view if exists public.partner_balances;

create view public.partner_balances
with (security_invoker = true) as
  select p.id as partner_id,
         coalesce(sum(cl.amount) filter (
           where cl.payout_id is null and cl.status in ('payable', 'reversed')), 0) as payable,
         coalesce(sum(cl.amount) filter (where cl.status = 'reserved'), 0) as reserved,
         coalesce(sum(cl.amount) filter (where cl.status = 'paid'), 0)     as paid,
         coalesce(sum(cl.amount), 0)                                       as total
  from public.partners p
  left join public.commission_ledger cl on cl.partner_id = p.id
  group by p.id;

revoke all on public.partner_balances from anon, authenticated;
grant select on public.partner_balances to authenticated;

-- ---------------------------------------------------------------------
-- ٤) طلب الصرف — المبلغ من القاعدة، والحجز في معاملة واحدة
--
-- ★ الشريك لا يكتب مبلغًا. الدالة تقفل القيود المتاحة، تجمعها،
-- تُنشئ الطلب، تربطها به، وتوسمها `reserved` — كل ذلك في معاملة
-- واحدة. فشل أي خطوة ⇒ تراجع كامل.
--
-- ★★ منع الطلب المزدوج بنيويًا لا بالواجهة: صفّ الشريك يُقفل أولًا
-- (`for update`). جلستان متزامنتان تتسلسلان، فالثانية لا ترى القيود
-- متاحةً بعد أن حجزتها الأولى ⇒ طلب واحد لا طلبان بنفس العمولات.
--
-- ★ التوقيع تغيّر: لم يعد يقبل مبلغًا. التوقيع القديم يُسقَط حتى لا
-- يبقى بابٌ يكتب فيه الشريك رقمًا.
-- ---------------------------------------------------------------------
drop function if exists public.request_partner_payout(numeric, text, text);

create or replace function public.request_partner_payout(
  p_note            text default null,
  p_idempotency_key text default null
)
returns table (payout_id uuid, amount numeric, commission_count integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_key     text := coalesce(nullif(trim(p_idempotency_key), ''), app.random_token(16));
  v_partner public.partners%rowtype;
  v_exist   public.partner_payouts%rowtype;
  v_min     numeric(14,2);
  v_total   numeric(14,2) := 0;
  v_count   integer := 0;
  v_row     record;
  v_id      uuid;
begin
  select * into v_partner from public.partners
   where id = app.current_partner_id();
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- نفس المفتاح ⇒ نفس الطلب (§13)
  select * into v_exist from public.partner_payouts where idempotency_key = v_key;
  if found then
    return query select v_exist.id, v_exist.amount,
      (select count(*)::integer from public.commission_ledger
        where payout_id = v_exist.id);
    return;
  end if;

  -- ★★ قفل الشريك: نقطة التسلسل لكل طلبات هذا الشريك
  select * into v_partner from public.partners where id = v_partner.id for update;

  if not app.partner_payout_ready(v_partner.id) then
    raise exception 'ACCOUNT_INCOMPLETE: أكمل بيانات استلام الأرباح أولًا'
      using errcode = 'P0001';
  end if;

  -- طلب قائم يحجز رصيدًا: طلبان معًا يعنيان صرفًا مزدوجًا
  if exists (
    select 1 from public.partner_payouts
    where partner_id = v_partner.id
      and status in ('submitted', 'pending_review', 'approved')
  ) then
    raise exception 'PAYOUT_PENDING: لديك طلب صرف قيد المعالجة' using errcode = 'P0001';
  end if;

  v_id := gen_random_uuid();

  -- القيود المتاحة: غير مرتبطة بصرف، ومستحقة أو عكسًا مفتوحًا.
  -- العكس يُحجز معها ليُستهلك مرة واحدة ويُخصم من هذا الطلب.
  for v_row in
    select id, amount, status from public.commission_ledger
     where partner_id = v_partner.id
       and payout_id is null
       and status in ('payable', 'reversed')
     order by created_at
     for update
  loop
    v_total := v_total + v_row.amount;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 or v_total <= 0 then
    raise exception 'NO_BALANCE: لا رصيد مستحق للصرف' using errcode = 'P0001';
  end if;

  select min_payout_amount into v_min from public.platform_settings where id;
  if v_min is not null and v_total < v_min then
    raise exception 'BELOW_MINIMUM: أقل مبلغ للصرف % ', v_min using errcode = 'P0001';
  end if;

  insert into public.partner_payouts
    (id, partner_id, amount, method, status, initiated_by, initiated_by_kind,
     note, idempotency_key, account_snapshot)
  values (v_id, v_partner.id, v_total, v_partner.payout_method, 'submitted',
          (select auth.uid()), 'partner', nullif(trim(p_note), ''), v_key,
          jsonb_build_object(
            'method',      v_partner.payout_method,
            'beneficiary', v_partner.payout_beneficiary,
            'bank',        v_partner.payout_bank,
            'account',     v_partner.payout_account,
            'phone',       v_partner.payout_phone,
            'taken_at',    now()));

  -- الحجز: القيد المرتبط بطلب لا يُلتقط في طلب آخر
  perform set_config('app.commission_write', 'on', true);
  update public.commission_ledger
     set payout_id = v_id,
         status = case when status = 'payable' then 'reserved'::public.commission_status
                       else status end
   where partner_id = v_partner.id
     and payout_id is null
     and status in ('payable', 'reversed');
  perform set_config('app.commission_write', 'off', true);

  perform app.notify(v_partner.profile_id, 'payout.requested',
    'تم استلام طلب صرفك',
    'سنراجع الطلب ونحوّل المبلغ يدويًا ثم نعلمك.', '/partner/payouts', null,
    'payout.requested:' || v_id::text);

  return query select v_id, v_total, v_count;
end;
$$;

revoke execute on function public.request_partner_payout(text, text) from public, anon;
grant   execute on function public.request_partner_payout(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- فكّ الحجز — يُستعمل عند الرفض وعند سحب الشريك لطلبه.
-- العمولة تعود «متاحة» ولا تضيع ولا تصير مدفوعة.
-- ---------------------------------------------------------------------
create or replace function app.release_payout_commissions(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.commission_write', 'on', true);
  update public.commission_ledger
     set payout_id = null,
         status = case when status = 'reserved' then 'payable'::public.commission_status
                       else status end
   where payout_id = p_payout_id
     and status in ('reserved', 'reversed');
  perform set_config('app.commission_write', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------
-- سحب الشريك لطلبه قبل تسجيله إداريًا.
-- ---------------------------------------------------------------------
create or replace function public.cancel_partner_payout(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid := app.current_partner_id();
  p public.partner_payouts%rowtype;
begin
  if v_partner is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into p from public.partner_payouts where id = p_payout_id for update;
  if not found or p.partner_id <> v_partner then
    raise exception 'NOT_FOUND: الطلب غير موجود' using errcode = 'P0002';
  end if;
  if p.status <> 'submitted' then
    raise exception 'VALIDATION: لا يُسحب طلب بدأت معالجته' using errcode = 'P0001';
  end if;

  update public.partner_payouts set status = 'cancelled' where id = p_payout_id;
  perform app.release_payout_commissions(p_payout_id);
end;
$$;

revoke execute on function public.cancel_partner_payout(uuid) from public, anon;
grant   execute on function public.cancel_partner_payout(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- ٥) الرفض يعيد الرصيد
--
-- نفس دالة المراجعة و نفس فصل المهام (D30) — تُضاف إليها خطوة فكّ
-- الحجز، وإشعار عند التسجيل. الاعتماد **ليس** دفعًا: يظل المبلغ
-- محجوزًا حتى يؤكّد موظف الدفع التحويل.
-- ---------------------------------------------------------------------
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
  if p.status in ('cancelled', 'rejected') then
    raise exception 'VALIDATION: الطلب مغلق' using errcode = 'P0001';
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

    -- ★ العمولة لا تضيع ولا تصير مدفوعة: تعود متاحة كما كانت
    perform app.release_payout_commissions(p_payout_id);

    perform app.notify(v_partner.profile_id, 'payout.rejected',
      'لم يُعتمد طلب الصرف', trim(p_reason), '/partner/payouts', null,
      'payout.rejected:' || p.id::text);
    perform app.queue_email(v_partner.email, 'payout_status',
      jsonb_build_object('amount', p.amount, 'status_label', 'مرفوض',
                         'reason', trim(p_reason)),
      'payout_rejected:' || p.id::text);

    return jsonb_build_object('status', 'rejected');
  end if;

  -- approve — قبول الطلب لا تحويل المال
  if p.requested_by is null then
    raise exception 'SOD_ORDER: لا اعتماد قبل تسجيل الطلب إداريًا'
      using errcode = 'P0001';
  end if;
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
    'اعتُمد طلب الصرف وسيُحوَّل قريبًا',
    'الاعتماد ليس تحويلًا — سنعلمك فور إتمام التحويل.',
    '/partner/payouts', null, 'payout.approved:' || p.id::text);

  return jsonb_build_object('status', 'approved');
end;
$$;

revoke execute on function public.review_payout(uuid, text, text) from public, anon;
grant   execute on function public.review_payout(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- ٦) تأكيد التحويل اليدوي
--
-- ★ الفرق عن السابق: القيود المصروفة هي **المحجوزة لهذا الطلب**
-- لا أول ما يُصادَف من المتاح. لا التقاط عشوائي ⇒ لا خلط بين طلبين.
--
-- ★ يُسجَّل تاريخ التحويل ومرجعه وملاحظته وإثباته إن وُجد. الشريك
-- لا يكتب منها حرفًا (لا منح له على الجدول، والدالة تشترط
-- `payouts:approve`).
-- ---------------------------------------------------------------------
-- التوقيع القديم (uuid, text) يُسقط: نداء بوسيطين كان سيطابقه تمامًا
-- فيلتقط أول ما يصادفه من المتاح بدل المحجوز لهذا الطلب.
drop function if exists public.mark_payout_paid(uuid, text);

create or replace function public.mark_payout_paid(
  p_payout_id      uuid,
  p_reference      text default null,
  p_transferred_at timestamptz default null,
  p_note           text default null,
  p_proof_media_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.partner_payouts%rowtype;
  v_partner public.partners%rowtype;
  v_linked numeric(14,2) := 0;
begin
  if not app.has_platform_permission('payouts', 'approve') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_payout from public.partner_payouts where id = p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_payout.status = 'paid' then
    raise exception 'PAYOUT_ALREADY_PAID' using errcode = 'P0001';
  end if;
  if v_payout.status <> 'approved' then
    raise exception 'PAYOUT_NOT_APPROVED: لا يُصرف قبل الاعتماد' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reference), '') = '' then
    raise exception 'VALIDATION: أدخل مرجع التحويل' using errcode = 'P0001';
  end if;

  -- القيود المحجوزة لهذا الطلب وحدها تصير مدفوعة
  perform set_config('app.commission_write', 'on', true);
  update public.commission_ledger
     set status = 'paid'
   where payout_id = p_payout_id and status = 'reserved';
  perform set_config('app.commission_write', 'off', true);

  select coalesce(sum(amount), 0) into v_linked
    from public.commission_ledger where payout_id = p_payout_id;

  update public.partner_payouts
     set status = 'paid',
         paid_at = now(),
         transferred_at = coalesce(p_transferred_at, now()),
         reference = trim(p_reference),
         note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note),
         proof_media_id = coalesce(p_proof_media_id, proof_media_id)
   where id = p_payout_id;

  insert into public.ledger_entries
    (account_kind, account_id, entry_type, direction, amount, payout_id, memo, created_by)
  values ('partner', v_payout.partner_id, 'partner_payout', 'debit',
          v_payout.amount, p_payout_id, 'صرف مستحقات شريك', (select auth.uid()));

  select * into v_partner from public.partners where id = v_payout.partner_id;
  perform app.notify(v_partner.profile_id, 'payout.paid',
    'تم تحويل عمولتك',
    'مرجع التحويل: ' || trim(p_reference), '/partner/payouts', null,
    'payout.paid:' || p_payout_id::text);
  perform app.queue_email(v_partner.email, 'payout_status',
    jsonb_build_object('amount', v_payout.amount, 'status_label', 'مدفوع',
                       'reason', trim(p_reference)),
    'payout_paid:' || p_payout_id::text);

  return v_linked;
end;
$$;

revoke execute on function public.mark_payout_paid(uuid, text, timestamptz, text, uuid)
  from public, anon;
grant execute on function public.mark_payout_paid(uuid, text, timestamptz, text, uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- ٧) إغلاق باب الإدراج المباشر لطلب الصرف
--
-- ★★ كانت `payouts_partner_request` تسمح للشريك بإدراج صفّ صرف
-- بنفسه — أي بمبلغ من عنده وبلا حجز أي عمولة. المبلغ الآن يُحسب في
-- القاعدة حصرًا، فلا يبقى لهذا الباب معنى إلا الالتفاف عليه.
-- ---------------------------------------------------------------------
drop policy if exists "payouts_partner_request" on public.partner_payouts;
revoke insert on public.partner_payouts from authenticated;

-- ---------------------------------------------------------------------
-- ٨) التسجيل كشريك — بمبادرة صاحب الحساب نفسه
--
-- ★ لا نظام مصادقة جديد: الحساب يُنشأ بـSupabase Auth كما هو
-- (بريد أو Google)، وهذه الدالة تُنشئ **ملف الشريك** للحساب القائم.
--
-- ★ النسبة من `platform_settings.default_partner_rate` — موضع واحد
-- للرقم في النظام كلّه.
--
-- ★ لا ملف ثانٍ: حساب له ملف يعود كما هو. وحساب موقوف أو موظف منصة
-- لا يصير شريكًا.
-- ---------------------------------------------------------------------
create or replace function public.become_partner()
returns table (partner_id uuid, referral_code text, serial_no integer,
               was_created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user    uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_partner public.partners%rowtype;
  v_email   text;
  v_rate    numeric;
  v_code    text;
  v_try     integer := 0;
  v_id      uuid;
  v_serial  integer;
begin
  if v_user is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_user;
  if not found then
    raise exception 'NOT_FOUND: الحساب غير موجود' using errcode = 'P0002';
  end if;
  if v_profile.account_status <> 'active' then
    raise exception 'VALIDATION: الحساب موقوف أو مغلق' using errcode = 'P0001';
  end if;
  -- من يعتمد العمولة لا يستحقّها (D29)
  if v_profile.is_platform_staff then
    raise exception 'VALIDATION: موظف المنصة لا يكون شريكًا' using errcode = 'P0001';
  end if;

  -- ملف قائم ⇒ يُعاد كما هو. الموقوف لا يُفعّل نفسه.
  select * into v_partner from public.partners where profile_id = v_user;
  if found then
    return query select v_partner.id, v_partner.referral_code,
                        v_partner.serial_no, false;
    return;
  end if;

  select u.email::text into v_email from auth.users u where u.id = v_user;
  if coalesce(trim(v_email), '') = '' then
    raise exception 'VALIDATION: لا بريد لهذا الحساب' using errcode = 'P0001';
  end if;

  -- دعوة معلّقة بنفس البريد تُربط بدل أن يُنشأ ملف ثانٍ
  select * into v_partner from public.partners
   where lower(email) = lower(v_email) and profile_id is null
   for update;
  if found then
    update public.partners
       set profile_id = v_user, status = 'active', invite_token_hash = null,
           name = coalesce(nullif(trim(v_profile.full_name), ''), name)
     where id = v_partner.id;
    perform app.audit('partner.joined', 'partner', v_partner.id, null, null,
      jsonb_build_object('via', 'self_signup'));
    return query select v_partner.id, v_partner.referral_code,
                        v_partner.serial_no, false;
    return;
  end if;

  select default_partner_rate into v_rate from public.platform_settings where id;

  loop
    v_try := v_try + 1;
    v_code := upper(substr(app.random_token(5), 1, 8));
    exit when not exists (select 1 from public.partners where referral_code = v_code);
    if v_try > 8 then
      raise exception 'INTERNAL: تعذّر توليد رمز إحالة' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.partners
    (profile_id, name, email, phone, status, referral_code, commission_rate)
  values (v_user,
          coalesce(nullif(trim(v_profile.full_name), ''), split_part(v_email, '@', 1)),
          lower(v_email), v_profile.phone, 'active', v_code, v_rate)
  returning id, serial_no into v_id, v_serial;

  perform app.audit('partner.self_joined', 'partner', v_id, null, null,
    jsonb_build_object('code', v_code, 'rate', v_rate));

  return query select v_id, v_code, v_serial, true;
end;
$$;

revoke execute on function public.become_partner() from public, anon;
grant   execute on function public.become_partner() to authenticated;

-- ---------------------------------------------------------------------
-- ٩) الرابط القصير ⟶ نظام الإحالة القائم
--
-- الرقم وحده يخرج إلى العالم؛ هذه الدالة تترجمه إلى رمز الإحالة
-- الذي يفهمه `record_referral_visit` و`attribute_referral` بلا
-- تغيير حرف فيهما. فلا نظام إسناد ثانٍ: مدخل ثانٍ لنفس النظام.
--
-- ★ الشريك غير النشط لا يُترجَم رقمه ⇒ رابط موقوف لا يُسنِد.
-- ---------------------------------------------------------------------
create or replace function public.partner_code_by_serial(p_serial integer)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select referral_code from public.partners
   where serial_no = p_serial and status = 'active';
$$;

revoke execute on function public.partner_code_by_serial(integer) from public;
grant   execute on function public.partner_code_by_serial(integer) to anon, authenticated;

-- ---------------------------------------------------------------------
-- ١٠) طلبات الصرف — للشريك ولموظف المنصة بقاعدة تخويل واحدة.
-- لقطة الحساب تخرج لموظف الصرف وحده: هو من يحتاجها ليحوّل.
-- ---------------------------------------------------------------------
create or replace function public.partner_payout_rows(
  p_partner_id uuid default null,
  p_limit      integer default 50
)
returns table (
  payout_id       uuid,
  amount          numeric,
  status          text,
  note            text,
  rejected_reason text,
  reference       text,
  transferred_at  timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz,
  commission_count integer,
  account_snapshot jsonb,
  partner_name    text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
  v_admin   boolean := false;
  v_limit   integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if p_partner_id is null then
    v_partner := app.current_partner_id();
    if v_partner is null then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  else
    if not app.has_platform_permission('payouts', 'view') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    v_partner := p_partner_id;
    v_admin := true;
  end if;

  return query
  select po.id, po.amount, po.status::text, po.note, po.rejected_reason,
         po.reference, po.transferred_at, po.paid_at, po.created_at,
         (select count(*)::integer from public.commission_ledger cl
           where cl.payout_id = po.id),
         case when v_admin then po.account_snapshot else null end,
         pt.name
    from public.partner_payouts po
    join public.partners pt on pt.id = po.partner_id
   where po.partner_id = v_partner
   order by po.created_at desc
   limit v_limit;
end;
$$;

revoke execute on function public.partner_payout_rows(uuid, integer) from public, anon;
grant   execute on function public.partner_payout_rows(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------
-- ١١) ملف الشريك ورصيده في نداء واحد.
--
-- ★ لماذا دالة لا استعلام؟ `partners` يحمل نسبة الشريك وحالته
-- وبيانات استلامه؛ قراءته من الواجهة تعني اختيار أعمدة بعناية في
-- كل مكان. هنا يخرج ما يحتاجه الشريك لا أكثر، مرّة واحدة.
-- ---------------------------------------------------------------------
create or replace function public.partner_self()
returns table (
  partner_id      uuid,
  name            text,
  referral_code   text,
  serial_no       integer,
  commission_rate numeric,
  status          text,
  payable         numeric,
  reserved        numeric,
  paid            numeric,
  total           numeric,
  account_ready   boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_partner uuid := app.current_partner_id();
begin
  if v_partner is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select p.id, p.name, p.referral_code, p.serial_no, p.commission_rate,
         p.status::text,
         coalesce(b.payable, 0), coalesce(b.reserved, 0),
         coalesce(b.paid, 0), coalesce(b.total, 0),
         app.partner_payout_ready(p.id)
    from public.partners p
    left join public.partner_balances b on b.partner_id = p.id
   where p.id = v_partner;
end;
$$;

revoke execute on function public.partner_self() from public, anon;
grant   execute on function public.partner_self() to authenticated;

-- ---------------------------------------------------------------------
-- ١٢) النسبة المعلنة في الصفحة العامة = النسبة التي تُمنح فعلًا.
--
-- `platform_settings` لا يُقرأ عامًّا (يحمل إعدادات فصل المهام ومدد
-- الاحتفاظ)، وهذه تفتح رقمًا واحدًا منه: النسبة الافتراضية. فلا
-- يُكتب «30%» في نصّ الصفحة ويُنسى عند تغييرها.
-- ---------------------------------------------------------------------
create or replace function public.platform_default_partner_rate()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select default_partner_rate from public.platform_settings where id;
$$;

revoke execute on function public.platform_default_partner_rate() from public;
grant   execute on function public.platform_default_partner_rate()
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- ١٣) طابور الصرف لموظف المنصة.
--
-- ★ لقطة بيانات الاستلام تخرج هنا: موظف الصرف هو من يحوّل، ولا
-- يستطيع ذلك بلا اسم مستفيد ورقم حساب. وتخرج من اللقطة لا من صفّ
-- الشريك — فبيانات طلب قديم تبقى كما أُرسلت.
-- ---------------------------------------------------------------------
create or replace function public.payout_admin_queue(
  p_limit integer default 100
)
returns table (
  payout_id        uuid,
  partner_id       uuid,
  partner_name     text,
  partner_email    text,
  amount           numeric,
  status           text,
  note             text,
  rejected_reason  text,
  reference        text,
  transferred_at   timestamptz,
  paid_at          timestamptz,
  created_at       timestamptz,
  commission_count integer,
  account_snapshot jsonb,
  requested_by     uuid,
  approved_by      uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if not app.has_platform_permission('payouts', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select po.id, pt.id, pt.name, pt.email, po.amount, po.status::text,
         po.note, po.rejected_reason, po.reference, po.transferred_at,
         po.paid_at, po.created_at,
         (select count(*)::integer from public.commission_ledger cl
           where cl.payout_id = po.id),
         po.account_snapshot, po.requested_by, po.approved_by
    from public.partner_payouts po
    join public.partners pt on pt.id = po.partner_id
   order by po.created_at desc
   limit v_limit;
end;
$$;

revoke execute on function public.payout_admin_queue(integer) from public, anon;
grant   execute on function public.payout_admin_queue(integer) to authenticated;
