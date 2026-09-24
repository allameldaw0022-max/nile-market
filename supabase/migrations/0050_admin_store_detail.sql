-- =====================================================================
-- 0050 فتح متجر من لوحة الإدارة (إضافية · قراءة فقط)
--
-- صفحة المتاجر كانت قائمة أسماء وحالات: لا رابط يفتح المتجر، ولا
-- طريق لمعرفة صاحبه أو باقته أو حجم نشاطه دون فتح الجداول يدويًا.
--
-- ★ قراءة لا انتحال: هذه الدالة **لا** تمنح موظف المنصة لوحة
-- التاجر ولا تكتب شيئًا. تجمع ما تسمح به سياسات المنصة أصلًا
-- (`*_platform_read` في 0003/0004/0005/0006) في نداء واحد مفحوص.
--
-- ★ ولا تُخرج ما لا يخصّ الإدارة: لا أرقام عملاء المتجر ولا
-- ملاحظات التاجر عليهم — أعداد مجمَّعة فقط.
-- =====================================================================

create or replace function public.admin_store_detail(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_owner public.profiles%rowtype;
  v_email text;
  v_phone record;
  v_root  text;
  v_host  text;
  v_result jsonb;
begin
  if not app.has_platform_permission('stores', 'view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_store from public.stores
   where id = p_store_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND: المتجر غير موجود' using errcode = 'P0002';
  end if;

  select * into v_owner from public.profiles where id = v_store.owner_id;
  select u.email::text into v_email from auth.users u where u.id = v_store.owner_id;
  select * into v_phone from app.best_contact_phone(v_store.owner_id);

  -- المضيف المعروض: النطاق الأساسي المفعَّل إن وُجد، وإلا الفرعي
  select hostname into v_host from public.store_domains
   where store_id = p_store_id and is_primary and status in ('active', 'ssl_active')
   limit 1;
  if v_host is null then
    select hostname into v_host from public.store_domains
     where store_id = p_store_id and status in ('active', 'ssl_active')
     order by created_at limit 1;
  end if;
  -- الجذر إعداد خادمي لا عمود (0011/0036)
  v_root := coalesce(nullif(current_setting('app.root_domain', true), ''),
                     'nilemarket.online');

  select jsonb_build_object(
    'store', jsonb_build_object(
      'id', v_store.id,
      'name', v_store.name,
      'slug', v_store.slug,
      'status', v_store.status,
      'created_at', v_store.created_at,
      'published_at', v_store.published_at,
      'suspended_reason', v_store.suspended_reason,
      'host', v_host,
      'can_checkout', app.store_can_checkout(p_store_id)
    ),
    'owner', jsonb_build_object(
      'profile_id', v_owner.id,
      'name', v_owner.full_name,
      'email', v_email,
      'phone', v_phone.phone,
      'phone_source', v_phone.source,
      'account_status', v_owner.account_status,
      'email_verified_at', v_owner.email_verified_at
    ),
    'subscription', (
      select jsonb_build_object(
        'plan', pl.name, 'status', sub.status,
        'started_at', sub.started_at,
        'current_period_end', sub.current_period_end,
        'grace_ends_at', sub.grace_ends_at)
      from public.subscriptions sub
      left join public.plans pl on pl.id = sub.plan_id
      where sub.store_id = p_store_id and sub.status <> 'cancelled'
      limit 1
    ),
    'partner', (
      select jsonb_build_object(
        'partner_id', pt.id, 'name', pt.name,
        'serial_no', pt.serial_no, 'attributed_at', r.attributed_at)
      from public.referrals r
      join public.partners pt on pt.id = r.partner_id
      where r.store_id = p_store_id
    ),
    'counts', jsonb_build_object(
      'products', (select count(*) from public.products
                    where store_id = p_store_id and deleted_at is null),
      'products_active', (select count(*) from public.products
                           where store_id = p_store_id and deleted_at is null
                             and status = 'active'),
      'orders', (select count(*) from public.orders where store_id = p_store_id),
      'orders_open', (select count(*) from public.orders
                       where store_id = p_store_id
                         and status not in ('completed', 'cancelled')),
      'customers', (select count(*) from public.customers
                     where store_id = p_store_id and deleted_at is null),
      'team', (select count(*) from public.store_members
                where store_id = p_store_id and status = 'active')
    ),
    'sales', jsonb_build_object(
      -- المدفوع فعلًا لا المطلوب: `paid_total` تشتقّه القاعدة من الدفعات
      'paid_total', (select coalesce(sum(paid_total), 0) from public.orders
                      where store_id = p_store_id and status <> 'cancelled'),
      'last_order_at', (select max(created_at) from public.orders
                         where store_id = p_store_id)
    ),
    'domains', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'hostname', d.hostname, 'status', d.status,
               'is_primary', d.is_primary) order by d.is_primary desc, d.created_at), '[]'::jsonb)
      from public.store_domains d where d.store_id = p_store_id
    ),
    'root_domain', v_root
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_store_detail(uuid) from public, anon;
grant   execute on function public.admin_store_detail(uuid) to authenticated;
