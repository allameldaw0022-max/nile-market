-- ═══════════════════════════════════════════════════════════════════
-- توفّرُ المنتج: عمودٌ مصون، وتنبيهُ عودةٍ إلى المخزون.
-- ═══════════════════════════════════════════════════════════════════
--
-- ★★ لماذا عمودٌ لا تعبيرٌ محسوب: التوفّر هو
-- `not track_inventory or exists(quantity - reserved > 0)` — تعبيرٌ عبر
-- جدولين، لا يرشّحه PostgREST ولا يفيده فهرس. والتقريب الذي كان متاحًا
-- (`quantity > 0`) **يكذب** في حالتين: منتجٌ كلّ كمّيته محجوزة في طلبات
-- معلّقة يظهر «متوفّرًا»، ومنتجٌ بلا تتبّع مخزون لا صفَّ له فيختفي من
-- النتائج. وترشيحٌ يكذب أسوأ من غيابه.
--
-- ★★ والعمود مصونٌ بمحفّز لا يُكتب من التطبيق: قيمةٌ يكتبها التطبيق
-- تنحرف عن الحقيقة أول مرّة يُنسى فيها نداء. والمحفّز لا يكتب إلا حين
-- تتغيّر القيمة فعلًا — وإلا صار كل حجز مخزون كتابةً على `products`
-- تُبطل تخزينها بلا داعٍ.
--
-- ★ لا حدّ باقة يُرفع، ولا سعر يُمَسّ، ولا عمود قائم يُحذف.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════ ١) عمود التوفّر ═══════════════

alter table public.products
  add column if not exists in_stock boolean not null default true;

-- ★ فهرس جزئيّ على ما يُستعلَم فعلًا: منتجات متجرٍ نشطة غير محذوفة.
create index if not exists products_in_stock_idx
  on public.products (store_id, in_stock)
  where status = 'active' and deleted_at is null;

/**
 * هل للمنتج رصيدٌ قابل للبيع؟
 * منتجٌ بلا تتبّع مخزون متوفّرٌ دائمًا — لا صفَّ له أصلًا.
 */
create or replace function app.product_has_stock(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not p.track_inventory then true
    else exists (
      select 1 from public.inventory i
      where i.product_id = p.id and (i.quantity - i.reserved) > 0
    )
  end
  from public.products p
  where p.id = p_product_id;
$$;

revoke all on function app.product_has_stock(uuid) from public, anon, authenticated;

/**
 * مزامنة العمود من حركة المخزون.
 *
 * ★★ لا كتابة بلا تغيّر: `where in_stock is distinct from v_now` هو ما
 * يمنع كل حجزٍ وإفراج من أن يصير كتابةً على `products`. بدونه يصير
 * إتمامُ طلبٍ واحد عدّة كتابات تُبطل تخزين صفحات المتجر كلّها.
 */
create or replace function app.sync_in_stock_from_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product uuid := coalesce(new.product_id, old.product_id);
  v_now     boolean;
begin
  if v_product is null then return null; end if;
  v_now := app.product_has_stock(v_product);

  update public.products
  set in_stock = v_now
  where id = v_product and in_stock is distinct from v_now;

  return null;
end;
$$;

drop trigger if exists inventory_sync_in_stock on public.inventory;
create trigger inventory_sync_in_stock
  after insert or update of quantity, reserved or delete on public.inventory
  for each row execute function app.sync_in_stock_from_inventory();

/**
 * العمود حقيقةٌ مشتقّة — يُحسب في كل كتابة ولا يُقبل من العميل.
 *
 * ★★ لماذا محفّز لا منحة عمودية: `authenticated` يملك `update` على
 * **مستوى الجدول** منذ 0004، و`revoke update (col)` لا يُنقص من منحةٍ
 * على مستوى الجدول — جُرِّب فسقط الاختبار. وهذا نفس ما تفعله
 * `app.protect_store_columns` بـ`status` و`deleted_at`: تُعيد القيمة
 * بدل أن تعتمد على منحة لا تكفي.
 *
 * ★★ ويُحسب من `new` لا من الجدول: الصفّ لم يُكتب بعد، فقراءة
 * `track_inventory` من الجدول تعطي القيمة **القديمة** — ومنتجٌ أُوقف
 * تتبّعه للتوّ كان سيبقى «نافدًا».
 *
 * ★ وعلى كل تحديث لا على عمودٍ بعينه: وإلا مرّرت كتابةٌ على عمود آخر
 *   قيمةً مزوّرة لـ`in_stock` في نفس الجملة.
 */
create or replace function app.enforce_in_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.in_stock := case
    when not new.track_inventory then true
    else exists (
      select 1 from public.inventory i
      where i.product_id = new.id and (i.quantity - i.reserved) > 0
    )
  end;
  return new;
end;
$$;

drop trigger if exists products_sync_in_stock on public.products;
create trigger products_sync_in_stock
  before update on public.products
  for each row execute function app.enforce_in_stock();

-- ★ تعبئة ما هو قائم: العمود يولد `true` افتراضًا، فمنتجٌ نافدٌ اليوم
--   كان سيُعلَن متوفّرًا حتى أول حركة مخزون.
update public.products p
set in_stock = app.product_has_stock(p.id)
where p.in_stock is distinct from app.product_has_stock(p.id);

-- ★ والمنحة العمودية تُسحب أيضًا — لا تكفي وحدها (المنحة على مستوى
--   الجدول تتجاوزها) لكنها تُغلق الباب على anon الذي لا يملك الجدول.
revoke update (in_stock) on public.products from anon, authenticated;

-- ═══════════════ ٢) تنبيه العودة إلى المخزون ═══════════════

create table if not exists public.stock_alerts (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id)   on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  email       text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  created_at  timestamptz not null default now(),
  notified_at timestamptz
);

-- ★ طلبٌ معلّق واحد لكل (منتج · بريد): إعادة الضغط لا تُنشئ سجلًّا
--   ثانيًا ولا تُرسل بريدين. وبعد التنبيه يجوز طلبٌ جديد.
create unique index if not exists stock_alerts_pending_unique
  on public.stock_alerts (product_id, lower(email))
  where notified_at is null;

create index if not exists stock_alerts_pending_idx
  on public.stock_alerts (product_id) where notified_at is null;

alter table public.stock_alerts enable row level security;

-- ★★ ولا سياسة قراءة لأي دور عميل: قائمة بُرُدٍ تنتظر منتجًا بيانٌ
--    شخصيّ. الإدراج بدالّة محدَّدة الأمان وحدها، والقراءة للخادم.
drop policy if exists stock_alerts_no_client_read on public.stock_alerts;
revoke all on public.stock_alerts from anon, authenticated;

/**
 * تسجيل طلب تنبيه — المسار الوحيد للكتابة.
 *
 * ★ المتجر يُشتقّ من المنتج لا من العميل: `store_id` مرسَلٌ من
 * المتصفّح كان سيسمح بتعليق بريدٍ على متجر آخر.
 * ★ ولا يُسجَّل طلبٌ لمنتج متوفّر أصلًا، ولا لمنتجٍ غير منشور.
 * ★ وحدُّ معدّل بنفس الدالّة التي يستعملها مسار الطلبات.
 */
create or replace function public.request_stock_alert(
  p_product_id uuid,
  p_email      text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store   uuid;
  v_ok      boolean;
  v_email   text := lower(trim(p_email));
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL: بريد غير صالح.' using errcode = 'P0001';
  end if;

  select p.store_id, p.in_stock into v_store, v_ok
  from public.products p
  join public.stores s on s.id = p.store_id
  where p.id = p_product_id
    and p.status = 'active' and p.deleted_at is null
    and s.status = 'active' and s.deleted_at is null;

  if v_store is null then
    raise exception 'NOT_FOUND: المنتج غير متاح.' using errcode = 'P0001';
  end if;
  if v_ok then
    raise exception 'IN_STOCK: المنتج متوفّر الآن.' using errcode = 'P0001';
  end if;

  if not public.check_rate_limit('stockalert:' || v_email, 10, 3600) then
    raise exception 'RATE_LIMITED: طلبات كثيرة. حاول بعد قليل.'
      using errcode = 'P0001';
  end if;

  insert into public.stock_alerts (store_id, product_id, email)
  values (v_store, p_product_id, v_email)
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.request_stock_alert(uuid, text) from public;
grant execute on function public.request_stock_alert(uuid, text) to anon, authenticated;

/**
 * العودة إلى المخزون ⟶ بريدٌ في الطابور القائم.
 *
 * ★★ لا مُرسِلٌ ثانٍ: `email_outbox` ومهمّة `cron/emails` تُرسلان
 * بالفعل، و`dedupe_key` فيه يمنع التكرار ولو فُتح المسار مرّتين.
 * ★ ولا يُرسل إلا عند الانتقال false ⟶ true: الكتابة الأخرى لا تُنبّه.
 */
create or replace function app.notify_stock_back()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host  text;
  v_store text;
begin
  if not (new.in_stock and not old.in_stock) then return null; end if;
  if new.status <> 'active' or new.deleted_at is not null then return null; end if;

  select d.hostname into v_host
  from public.store_domains d
  where d.store_id = new.store_id and d.is_primary
    and d.released_at is null
  limit 1;

  select s.name into v_store from public.stores s where s.id = new.store_id;

  insert into public.email_outbox (to_email, template, payload, dedupe_key)
  select a.email, 'stock_back',
         jsonb_build_object(
           'product_name', new.name,
           'store_name',   coalesce(v_store, ''),
           'product_url',  case when v_host is null then ''
                           else 'https://' || v_host || '/products/' || new.slug end),
         'stockback:' || a.id::text
  from public.stock_alerts a
  where a.product_id = new.id and a.notified_at is null
  on conflict (dedupe_key) do nothing;

  update public.stock_alerts
  set notified_at = now()
  where product_id = new.id and notified_at is null;

  return null;
end;
$$;

drop trigger if exists products_notify_stock_back on public.products;
create trigger products_notify_stock_back
  after update of in_stock on public.products
  for each row execute function app.notify_stock_back();
