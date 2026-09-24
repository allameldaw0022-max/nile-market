-- =====================================================================
-- 0051 تقييم المنتجات (إضافية)
--
-- تقييم من ١ إلى ٥ نجوم، بمتوسّط وعدد يظهران في بطاقة المنتج وصفحته.
--
-- ★ القاعدة التي يقوم عليها النظام كلّه: **لا تقييم بلا شراء**.
-- التحقّق ليس في الواجهة بل في القاعدة، ولا يوجد مسار إدراج مباشر
-- إلى الجدول إطلاقًا — لا سياسة INSERT ولا منح INSERT. الطريق
-- الوحيد `submit_product_review` التي تثبت وجود طلب حقيقي لهذا
-- المنتج باسم هذا العميل في هذا المتجر قبل أن تكتب شيئًا.
--
-- ★ ولماذا المسجَّلون وحدهم: طلب الزائر يُنشأ بـ`customer_id = null`
-- (0039) — لا هوية ثابتة تُمنع من التكرار ولا يُثبت شراؤه لاحقًا.
-- فتح التقييم للزوّار يعني فتح باب التقييم الوهمي على مصراعيه.
--
-- ★ ولا يُعاد بناء شيء قائم: `customers` و`orders` و`order_items`
-- و`app.current_customer_id` كما هي، ولا جدول عملاء ثانٍ ولا نظام
-- هوية موازٍ.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ١) حالة التقييم
-- ---------------------------------------------------------------------
-- `hidden` للتاجر ليُخفي إساءةً أو بذاءة — لا ليحذف رأيًا لا يعجبه:
-- الصفّ يبقى، ويُستثنى من المتوسّط، ولا يملك التاجر تعديل نصّه ولا
-- نجومه (حارس الأعمدة أدناه).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'review_status'
                   and typnamespace = 'public'::regnamespace) then
    create type public.review_status as enum ('published', 'hidden');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- ٢) الجدول
-- ---------------------------------------------------------------------
create table if not exists public.product_reviews (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores (id)    on delete cascade,
  product_id  uuid not null references public.products (id)  on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id)  on delete cascade,
  -- الطلب الذي أثبت الشراء — سند التقييم، ويُظهر شارة «شراء موثّق»
  order_id    uuid references public.orders (id) on delete set null,
  rating      smallint not null check (rating between 1 and 5),
  body        text check (body is null or length(body) <= 1000),
  -- ★ اسم معروض مُقنَّع يُحسب خادميًا (الاسم الأول + حرف): الاسم
  -- الكامل لزبون بيانٌ شخصي لا يُنشر على صفحة عامة، وقراءة
  -- `profiles` من المسار العام ليست واردة أصلًا.
  author_name text not null,
  status      public.review_status not null default 'published',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ★ تقييم واحد لكل عميل لكل منتج — على مستوى القاعدة لا الواجهة.
create unique index if not exists product_reviews_one_per_customer
  on public.product_reviews (product_id, customer_id);
create index if not exists product_reviews_product_idx
  on public.product_reviews (product_id, status, created_at desc);
create index if not exists product_reviews_store_idx
  on public.product_reviews (store_id, created_at desc);

drop trigger if exists product_reviews_set_updated_at on public.product_reviews;
create trigger product_reviews_set_updated_at before update on public.product_reviews
  for each row execute function app.set_updated_at();

drop trigger if exists product_reviews_freeze_store on public.product_reviews;
create trigger product_reviews_freeze_store before update on public.product_reviews
  for each row execute function app.freeze_store_id();

alter table public.product_reviews enable row level security;

-- ---------------------------------------------------------------------
-- ٣) المتوسّط والعدد على المنتج
-- ---------------------------------------------------------------------
-- ★ مُفكَّكان عمودين لا حسابًا عند القراءة: بطاقة المنتج تظهر في
-- شبكات من ٢٤ بطاقة، وحساب المتوسّط لكل بطاقة استعلامٌ لكل بطاقة.
-- المصدر يبقى الجدول، والعمودان يُشتقّان منه بمحفّز لا باليد.
alter table public.products
  add column if not exists rating_avg   numeric(3,2),
  add column if not exists rating_count integer not null default 0;

-- ★ `rating_avg` يبقى null بلا تقييمات: صفرٌ معناه «قُيّم بأسوأ
-- درجة»، وهو كذبٌ على منتج لم يقيّمه أحد.

create or replace function app.refresh_product_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p
     set rating_count = agg.n,
         rating_avg   = agg.avg
    from (
      select count(*)::integer as n,
             case when count(*) = 0 then null
                  else round(avg(r.rating)::numeric, 2) end as avg
        from public.product_reviews r
       where r.product_id = v_product and r.status = 'published'
    ) agg
   where p.id = v_product;
  return null;
end;
$$;

drop trigger if exists product_reviews_refresh_rating on public.product_reviews;
create trigger product_reviews_refresh_rating
  after insert or update or delete on public.product_reviews
  for each row execute function app.refresh_product_rating();

-- ★ 0038 سحب منح الجدول ومنح الأعمدة صراحةً، فأي عمود جديد يبقى
-- محجوبًا حتى يُذكر هنا عن قصد. هذان عامّان بطبيعتهما.
grant select (rating_avg, rating_count) on public.products to anon, authenticated;

-- ---------------------------------------------------------------------
-- ٤) حارس الأعمدة: التاجر يُخفي ولا يؤلّف
-- ---------------------------------------------------------------------
-- بدون هذا الحارس كانت سياسة التحديث أدناه تسمح للتاجر بتغيير
-- نجوم التقييم ونصّه — أي بتزوير رأي زبونه، وهو أخطر من حذفه.
--
-- ★ ولماذا راية صريحة لا فحص `auth.uid() = old.profile_id`: صاحب
-- التقييم **لا يملك** UPDATE على الجدول أصلًا (المنح أدناه يقتصر
-- على `status`، والسياسة تشترط صلاحية المتجر)، فطريقه الوحيد
-- `submit_product_review`. الراية تُرفع داخلها وحدها ولمدّة المعاملة،
-- فلا يوجد مسار آخر يرفعها.
create or replace function app.protect_review_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.review_write', true), '') = 'on' then
    return new;
  end if;
  new.id          := old.id;
  new.store_id    := old.store_id;
  new.product_id  := old.product_id;
  new.customer_id := old.customer_id;
  new.profile_id  := old.profile_id;
  new.order_id    := old.order_id;
  new.rating      := old.rating;
  new.body        := old.body;
  new.author_name := old.author_name;
  new.created_at  := old.created_at;
  return new;
end;
$$;

drop trigger if exists product_reviews_protect on public.product_reviews;
create trigger product_reviews_protect before update on public.product_reviews
  for each row execute function app.protect_review_columns();

-- ---------------------------------------------------------------------
-- ٥) السياسات
-- ---------------------------------------------------------------------
-- ★ لا سياسة INSERT ولا DELETE لأحد: الكتابة عبر الدالة وحدها،
-- والتقييم سجلّ لا يُمحى.
drop policy if exists reviews_public_read   on public.product_reviews;
drop policy if exists reviews_own_read      on public.product_reviews;
drop policy if exists reviews_member_read   on public.product_reviews;
drop policy if exists reviews_member_update on public.product_reviews;
drop policy if exists reviews_platform_read on public.product_reviews;

create policy reviews_public_read on public.product_reviews
  for select to anon, authenticated
  using (status = 'published' and app.is_store_public(store_id));

-- صاحب التقييم يرى تقييمه ولو أخفاه التاجر — إخفاءٌ لا مصادرة
create policy reviews_own_read on public.product_reviews
  for select to authenticated
  using (profile_id = (select auth.uid()));

create policy reviews_member_read on public.product_reviews
  for select to authenticated
  using (app.has_store_permission(store_id, 'products:view'));

create policy reviews_member_update on public.product_reviews
  for update to authenticated
  using (app.has_store_permission(store_id, 'products:update'))
  with check (app.has_store_permission(store_id, 'products:update'));

create policy reviews_platform_read on public.product_reviews
  for select to authenticated
  using (app.has_platform_permission('products', 'view'));

-- ★ RLS تعمل على الصف لا على العمود (الدرس نفسه في 0038): سياسة
-- القراءة العامة كانت تكشف `profile_id` و`customer_id` و`order_id`
-- لكل زائر — أي تربط رأيًا منشورًا بحساب صاحبه ومعرّف طلبه. القراءة
-- العامة لا تحتاج شيئًا من ذلك، فالمنح قائمة بيضاء صريحة.
revoke all on public.product_reviews from anon, authenticated;
grant select (
  id, store_id, product_id, rating, body, author_name, status,
  created_at, updated_at
) on public.product_reviews to anon, authenticated;
grant update (status) on public.product_reviews to authenticated;

-- ---------------------------------------------------------------------
-- ٦) إثبات الشراء
-- ---------------------------------------------------------------------
-- ★ الحالات المقبولة: `shipped` و`completed`. الطلب الجديد أو قيد
-- التجهيز لم يصل صاحبه بعد فلا رأي له فيه، والملغى ليس شراءً.
create or replace function app.purchased_product_order(
  p_customer_id uuid, p_product_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
   where o.customer_id = p_customer_id
     and oi.product_id = p_product_id
     and o.status in ('shipped', 'completed')
   order by o.created_at
   limit 1;
$$;

revoke execute on function app.purchased_product_order(uuid, uuid) from public, anon;

-- ---------------------------------------------------------------------
-- ٧) كتابة التقييم — المسار الوحيد
-- ---------------------------------------------------------------------
create or replace function public.submit_product_review(
  p_product_id uuid,
  p_rating     integer,
  p_body       text default null
)
returns table (review_id uuid, rating_avg numeric, rating_count integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid      uuid := (select auth.uid());
  v_store    uuid;
  v_customer uuid;
  v_order    uuid;
  v_body     text := nullif(btrim(coalesce(p_body, '')), '');
  v_raw      text;
  v_parts    text[];
  v_name     text;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED: سجّل الدخول لتقييم المنتج'
      using errcode = '42501';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING: التقييم من نجمة إلى خمس نجوم'
      using errcode = 'P0001';
  end if;

  if v_body is not null and length(v_body) > 1000 then
    raise exception 'BODY_TOO_LONG: التعليق طويل جدًا' using errcode = 'P0001';
  end if;

  -- المتجر يُشتقّ من المنتج لا من العميل: فلا يُعلَّق تقييم على منتج
  -- متجر باسم متجر آخر، ولا يحتاج الفعل أن يفحص ذلك ثم يثق.
  select p.store_id into v_store
    from public.products p
    join public.stores s on s.id = p.store_id
   where p.id = p_product_id
     and p.status = 'active' and p.deleted_at is null
     and s.status = 'active' and s.deleted_at is null;

  if v_store is null then
    raise exception 'PRODUCT_UNAVAILABLE: المنتج غير متاح' using errcode = 'P0002';
  end if;

  v_customer := app.current_customer_id(v_store);
  if v_customer is null then
    raise exception 'NOT_PURCHASED: التقييم لمن اشترى هذا المنتج من هذا المتجر'
      using errcode = '42501';
  end if;

  v_order := app.purchased_product_order(v_customer, p_product_id);
  if v_order is null then
    raise exception 'NOT_PURCHASED: التقييم لمن اشترى هذا المنتج من هذا المتجر'
      using errcode = '42501';
  end if;

  -- الاسم المعروض: الأول كاملًا وحرفٌ من الذي يليه
  select coalesce(nullif(btrim(c.name), ''), nullif(btrim(pr.full_name), ''), 'زبون')
    into v_raw
    from public.customers c
    left join public.profiles pr on pr.id = v_uid
   where c.id = v_customer;

  v_parts := regexp_split_to_array(btrim(coalesce(v_raw, 'زبون')), '\s+');
  v_name  := v_parts[1];
  if array_length(v_parts, 1) > 1 then
    v_name := v_name || ' ' || substr(v_parts[2], 1, 1) || '.';
  end if;

  -- ★ تحديث لا صفّ ثانٍ: تغيير الرأي حقّ، وتكرار التقييم ليس كذلك.
  -- و`status` لا يُمسّ هنا: تعديل نصّ تقييمٍ أخفاه التاجر لا يعيد
  -- نشره تلقائيًا.
  --
  -- الراية تُخبر حارس الأعمدة أنّ هذا هو المسار المشروع لتعديل
  -- النجوم والنصّ، وتُطفأ فورًا بعده فلا تتسرّب إلى بقية المعاملة.
  perform set_config('app.review_write', 'on', true);

  insert into public.product_reviews
    (store_id, product_id, customer_id, profile_id, order_id,
     rating, body, author_name)
  values
    (v_store, p_product_id, v_customer, v_uid, v_order,
     p_rating::smallint, v_body, v_name)
  on conflict (product_id, customer_id) do update
    set rating     = excluded.rating,
        body       = excluded.body,
        order_id   = coalesce(public.product_reviews.order_id, excluded.order_id),
        updated_at = now()
  returning id into v_id;

  perform set_config('app.review_write', 'off', true);

  return query
  select v_id, p.rating_avg, p.rating_count
    from public.products p where p.id = p_product_id;
end;
$$;

revoke execute on function public.submit_product_review(uuid, integer, text)
  from public, anon;
grant   execute on function public.submit_product_review(uuid, integer, text)
  to authenticated;

comment on function public.submit_product_review(uuid, integer, text) is
  'يكتب أو يعدّل تقييم المستخدم لمنتج اشتراه فعلًا. المسار الوحيد للكتابة.';

-- ---------------------------------------------------------------------
-- ٨) حالة التقييم للمستخدم الحالي — ما تحتاجه صفحة المنتج
-- ---------------------------------------------------------------------
-- ★ لا تكشف شيئًا عن غير صاحبها: تعيد للزائر «لا يستطيع» بلا سبب
-- يفضح وجود طلب أو غيابه لأحد.
create or replace function public.product_review_state(p_product_id uuid)
returns table (
  can_review boolean,
  reason     text,
  my_rating  smallint,
  my_body    text,
  my_status  public.review_status,
  my_updated timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_store    uuid;
  v_customer uuid;
  v_review   public.product_reviews%rowtype;
begin
  if v_uid is null then
    return query select false, 'auth'::text, null::smallint, null::text,
                        null::public.review_status, null::timestamptz;
    return;
  end if;

  select p.store_id into v_store
    from public.products p
    join public.stores s on s.id = p.store_id
   where p.id = p_product_id
     and p.status = 'active' and p.deleted_at is null
     and s.status = 'active' and s.deleted_at is null;

  if v_store is null then
    return query select false, 'unavailable'::text, null::smallint, null::text,
                        null::public.review_status, null::timestamptz;
    return;
  end if;

  v_customer := app.current_customer_id(v_store);

  if v_customer is not null then
    select * into v_review from public.product_reviews r
     where r.product_id = p_product_id and r.customer_id = v_customer;
  end if;

  if v_customer is null
     or app.purchased_product_order(v_customer, p_product_id) is null then
    return query select false, 'not_purchased'::text,
                        v_review.rating, v_review.body,
                        v_review.status, v_review.updated_at;
    return;
  end if;

  return query select true, null::text,
                      v_review.rating, v_review.body,
                      v_review.status, v_review.updated_at;
end;
$$;

revoke execute on function public.product_review_state(uuid) from public, anon;
grant   execute on function public.product_review_state(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- ٩) قائمة التقييمات المنشورة — قراءة عامة مُحكمة
-- ---------------------------------------------------------------------
-- ★ دالة لا استعلام مباشر: تُثبّت الأعمدة الخارجة وترتيبها وسقف
-- الصفحة في مكان واحد، فلا يتّسع المكشوف بإضافة عمود إلى الجدول.
create or replace function public.product_reviews_page(
  p_product_id uuid,
  p_limit      integer default 10,
  p_offset     integer default 0
)
returns table (
  id          uuid,
  rating      smallint,
  body        text,
  author_name text,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.body, r.author_name, r.created_at
    from public.product_reviews r
    join public.products p on p.id = r.product_id
    join public.stores   s on s.id = r.store_id
   where r.product_id = p_product_id
     and r.status = 'published'
     and p.status = 'active' and p.deleted_at is null
     and s.status = 'active' and s.deleted_at is null
   order by r.created_at desc
   limit  greatest(1, least(coalesce(p_limit, 10), 50))
  offset  greatest(0, coalesce(p_offset, 0));
$$;

revoke execute on function public.product_reviews_page(uuid, integer, integer)
  from public;
grant   execute on function public.product_reviews_page(uuid, integer, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- ١٠) ملء العمودين للمنتجات القائمة (لا تقييمات بعد ⇒ صفر وnull)
-- ---------------------------------------------------------------------
update public.products p
   set rating_count = 0
 where p.rating_count is distinct from 0 and not exists (
   select 1 from public.product_reviews r where r.product_id = p.id);
