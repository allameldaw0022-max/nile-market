-- =====================================================================
-- 0041 إغلاق ميزتين مبنيّتين في القاعدة وغير موصولتين (إضافية)
--
-- الجدولان `wishlists` و`support_attachments` وسياساتهما ودلو التخزين
-- الخاصّ كلّها موجودة منذ 0012/0015، ولا مسار كود واحد يستعملها.
-- هذه الهجرة تُكمل ما ينقص في القاعدة وحدها — لا تُعيد بناء شيء قائم.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ١) منح زائدة على الجدولين
--
-- ★ الجدولان يرثان منحًا كاملة من `alter default privileges` على
-- السكيما: INSERT/UPDATE/DELETE/TRUNCATE لـ anon و authenticated.
-- RLS تحمي الصفوف، لكن `anon` لا سياسة له أصلًا فالمنح بلا معنى،
-- و`TRUNCATE` **لا تفحصه RLS إطلاقًا** — فهو أمر على الجدول لا على
-- الصفّ. أي أن الدور المجهول يحمل اليوم منح تفريغ جدول المفضّلة كلّه.
-- لم يُستغلّ لأن PostgREST لا يُصدر TRUNCATE، وهي حماية بالصدفة لا
-- بالتصميم.
--
-- ★ `wishlists` لا تحتاج UPDATE: العنصر يُضاف أو يُحذف، ولا حقل فيه
-- يتغيّر. و`support_attachments` مرفقات لا تُعدَّل ولا تُحذف بعد
-- الإرسال — سجلّ التذكرة يجب أن يبقى كما رآه الطرفان.
-- ---------------------------------------------------------------------
revoke all on public.wishlists           from anon, authenticated;
revoke all on public.support_attachments from anon, authenticated;

grant select, insert, delete on public.wishlists           to authenticated;
grant select, insert          on public.support_attachments to authenticated;


-- ---------------------------------------------------------------------
-- ٢) المفضّلة: تكامل المستأجر
--
-- ★ الثغرة: سياسة `wishlists_self` تفحص `profile_id = auth.uid()`
-- وحدها. لا شيء يربط `store_id` المُمرَّر بالمتجر الذي يملك المنتج
-- فعلًا. فيستطيع مستخدم مسجَّل أن يُدرج:
--
--     (store_id = متجر أ, profile_id = هو, product_id = منتج متجر ب)
--
-- فيُلوَّث كتالوج متجر أ بصفّ يشير إلى منتج ليس له، وتُحسب إحصاءات
-- «الأكثر إضافةً للمفضّلة» على متجر لا يملك المنتج. والفهرس الفريد
-- الثلاثي لا يمنع ذلك لأنه لا يعرف من يملك المنتج.
--
-- ★ الحاجز CHECK لا سياسة: القيد يسري على `service_role` أيضًا، وعلى
-- أي مسار مستقبلي يكتب في الجدول. السياسة تحمي من المستخدم وحده.
-- ---------------------------------------------------------------------
create or replace function app.wishlist_product_matches_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.products p
     where p.id = new.product_id
       and p.store_id = new.store_id
       and p.deleted_at is null
  ) then
    raise exception 'PRODUCT_STORE_MISMATCH: المنتج لا يخصّ هذا المتجر'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

comment on function app.wishlist_product_matches_store() is
  'يمنع ربط منتج متجر بمفضّلة متجر آخر — تكامل المستأجر داخل الصفّ.';

drop trigger if exists wishlists_store_integrity on public.wishlists;
create trigger wishlists_store_integrity
  before insert or update on public.wishlists
  for each row execute function app.wishlist_product_matches_store();


-- ---------------------------------------------------------------------
-- ٣) المفضّلة: القراءة والكتابة عبر دوال
--
-- ★ لماذا دوال لا كتابة مباشرة من PostgREST: العميل لا يعرف
-- `store_id` الصحيح ولا يجب أن يُصدَّق فيه. الدالة تشتقّه من المنتج
-- نفسه، فيسقط سطح التزوير كلّه بدل ردّه بفحص.
--
-- ★ التكرار: `on conflict do nothing` ثم إعادة الحالة. الضغط مرّتين
-- على قلب المنتج لا يجوز أن يُرجع خطأ قيد فريد خامًا للمتصفّح.
-- ---------------------------------------------------------------------
create or replace function public.toggle_wishlist(p_product_id uuid)
returns table (in_wishlist boolean, store_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
-- اسم عمود المخرجات `store_id` يطابق عمود الجدول، فيلتبس على
-- `on conflict`. تُحسم الأولوية للعمود صراحةً.
#variable_conflict use_column
declare
  v_uid   uuid := (select auth.uid());
  v_store uuid;
  v_removed integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED: سجّل الدخول لتحفظ منتجاتك المفضّلة'
      using errcode = '42501';
  end if;

  -- المتجر يُشتقّ من المنتج لا من العميل، والمنتج يجب أن يكون منشورًا
  select p.store_id into v_store
    from public.products p
    join public.stores s on s.id = p.store_id
   where p.id = p_product_id
     and p.status = 'active'
     and p.deleted_at is null
     and s.status = 'active'
     and s.deleted_at is null;

  if v_store is null then
    raise exception 'PRODUCT_UNAVAILABLE: المنتج غير متاح' using errcode = 'P0002';
  end if;

  delete from public.wishlists w
   where w.profile_id = v_uid and w.product_id = p_product_id;
  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    return query select false, v_store;
    return;
  end if;

  insert into public.wishlists (store_id, profile_id, product_id)
  values (v_store, v_uid, p_product_id)
  on conflict (store_id, profile_id, product_id) do nothing;

  return query select true, v_store;
end $$;

revoke execute on function public.toggle_wishlist(uuid) from public, anon;
grant   execute on function public.toggle_wishlist(uuid) to authenticated;

comment on function public.toggle_wishlist(uuid) is
  'يضيف المنتج إلى مفضّلة المستخدم أو يزيله. المتجر يُشتقّ من المنتج.';


/** أي من هذه المنتجات في مفضّلة المستخدم — نداء واحد لشبكة كاملة. */
create or replace function public.wishlist_state(p_product_ids uuid[])
returns table (product_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select w.product_id
    from public.wishlists w
   where w.profile_id = (select auth.uid())
     and w.product_id = any(p_product_ids);
$$;

revoke execute on function public.wishlist_state(uuid[]) from public, anon;
grant   execute on function public.wishlist_state(uuid[]) to authenticated;


/**
 * صفحة المفضّلة لمتجر واحد.
 *
 * ★ المنتج المحذوف أو المُخفى بعد الإضافة لا يُعرض، ولا يُسقط الصفحة:
 * الربط داخلي (inner join) فيختفي الصفّ بهدوء. والمفضّلة تبقى مقصورة
 * على متجر الطلب — لا تسرّب ما حفظه المستخدم في متجر آخر.
 */
create or replace function public.my_wishlist(p_store_id uuid)
returns table (
  product_id uuid, name text, slug text,
  price numeric, compare_at_price numeric,
  has_variants boolean, track_inventory boolean,
  available integer, image_bucket text, image_path text, image_blur text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.slug, p.price, p.compare_at_price,
         p.has_variants, p.track_inventory,
         coalesce((select i.quantity - i.reserved from public.inventory i
                    where i.product_id = p.id and i.variant_id is null), 0),
         mf.bucket, mf.path, mf.blur_data_url
    from public.wishlists w
    join public.products p on p.id = w.product_id
     and p.status = 'active' and p.deleted_at is null
    left join lateral (
      select m.bucket, m.path, m.blur_data_url
        from public.product_images pi
        join public.media_files m on m.id = pi.media_file_id
       where pi.product_id = p.id
       order by pi.is_primary desc, pi.sort_order
       limit 1
    ) mf on true
   where w.profile_id = (select auth.uid())
     and w.store_id   = p_store_id
   order by w.created_at desc;
$$;

revoke execute on function public.my_wishlist(uuid) from public, anon;
grant   execute on function public.my_wishlist(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- ٤) مرفقات الدعم: تحضير الرفع
--
-- ★ `prepare_upload` لا تصلح لهذا الغرض: تشترط `store_id` وصلاحية
-- **متجر**، بينما صاحب التذكرة قد يكون زبونًا لا يملك متجرًا، وتذكرة
-- المنصّة بلا متجر أصلًا. ولذلك كان `support_attachment` يسقط في
-- `else null` فيرجع `INVALID_PURPOSE`.
--
-- ★ المسار يُولَّد خادميًا بالكامل: `tickets/<ticket_id>/<uuid>.<ext>`.
-- لا جزء منه يأتي من المتصفّح، فلا Path Traversal ولا تصادم أسماء
-- ولا تسريب لاسم الملف الأصلي. والامتداد يُشتقّ من النوع المعلن لا
-- من اسم الملف — الامتداد المرسل من العميل لا يُصدَّق.
--
-- ★ بنية المسار نفسها هي ما تفحصه سياسات `storage.objects` القائمة
-- منذ 0015: المجلّد الأول `tickets` والثاني معرّف تذكرة يملكها
-- القارئ. فالدالة والسياسة يتّفقان على الشكل نفسه.
-- ---------------------------------------------------------------------
create or replace function public.prepare_support_upload(
  p_ticket_id uuid,
  p_mime      text,
  p_size      bigint
)
returns table (media_id uuid, bucket text, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_ticket  public.support_tickets%rowtype;
  v_allowed text[];
  v_limit   bigint;
  v_id      uuid := gen_random_uuid();
  v_ext     text;
  v_path    text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id;
  if not found then
    raise exception 'TICKET_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- من يكتب في هذه التذكرة: صاحبها أو موظّف دعم بصلاحية تحرير.
  -- هذان بالضبط هما من تسمح لهما سياسة `support_attach_insert` بالرفع
  -- إلى المجلّد، فلا تُمنح هنا صلاحية لا يقبلها التخزين.
  if not (v_ticket.requester_id = v_uid
          or app.has_platform_permission('support', 'edit')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- تذكرة مغلقة لا تقبل مرفقات جديدة
  if v_ticket.status = 'closed' then
    raise exception 'TICKET_CLOSED: التذكرة مغلقة' using errcode = 'P0001';
  end if;

  select allowed_mime_types, file_size_limit into v_allowed, v_limit
    from storage.buckets where id = 'support-attachments';

  if v_allowed is not null and not (p_mime = any(v_allowed)) then
    raise exception 'INVALID_MIME: نوع الملف غير مسموح' using errcode = 'P0001';
  end if;
  if p_size <= 0 then
    raise exception 'INVALID_SIZE' using errcode = 'P0001';
  end if;
  if v_limit is not null and p_size > v_limit then
    raise exception 'FILE_TOO_LARGE: حجم الملف يتجاوز الحد المسموح'
      using errcode = 'P0001';
  end if;

  -- الامتداد من النوع المعلن، لا من اسم الملف
  v_ext := case p_mime
             when 'image/jpeg'      then 'jpg'
             when 'image/png'       then 'png'
             when 'image/webp'      then 'webp'
             when 'application/pdf' then 'pdf'
             when 'text/plain'      then 'txt'
             else 'bin'
           end;

  v_path := 'tickets/' || p_ticket_id::text || '/' || v_id::text || '.' || v_ext;

  insert into public.media_files
    (id, bucket, path, owner_profile_id, store_id, purpose,
     mime_type, size_bytes, status)
  values (v_id, 'support-attachments', v_path, v_uid, v_ticket.store_id,
          'support_attachment', p_mime, p_size, 'pending');

  return query select v_id, 'support-attachments'::text, v_path;
end $$;

revoke execute on function public.prepare_support_upload(uuid, text, bigint)
  from public, anon;
grant   execute on function public.prepare_support_upload(uuid, text, bigint)
  to authenticated;


/**
 * ربط الملف المرفوع بالتذكرة (ورسالة بعينها إن وُجدت).
 *
 * ★ لا يُقبل إلا ملفّ رفعه هذا المستخدم نفسه لهذه التذكرة بعينها:
 * تمرير `media_id` لملفّ آخر — ولو كان ملفّه هو في تذكرة أخرى —
 * يُرفض. وبذلك لا يُستعمل الربط لتهريب ملف بين تذكرتين.
 */
create or replace function public.attach_to_ticket(
  p_ticket_id uuid,
  p_media_id  uuid,
  p_message_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_media public.media_files%rowtype;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_media from public.media_files
   where id = p_media_id
     and owner_profile_id = v_uid
     and bucket = 'support-attachments'
     and purpose = 'support_attachment';
  if not found then
    raise exception 'MEDIA_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- الملف يجب أن يكون في مجلّد هذه التذكرة — لا ربط عابر للتذاكر
  if v_media.path <> ('tickets/' || p_ticket_id::text || '/' ||
                      p_media_id::text || substring(v_media.path from '\.[a-z0-9]+$')) then
    raise exception 'TICKET_MISMATCH: المرفق لا يخصّ هذه التذكرة'
      using errcode = '42501';
  end if;

  if p_message_id is not null and not exists (
    select 1 from public.support_messages m
     where m.id = p_message_id and m.ticket_id = p_ticket_id
  ) then
    raise exception 'MESSAGE_MISMATCH' using errcode = '42501';
  end if;

  update public.media_files set status = 'ready'
   where id = p_media_id;

  insert into public.support_attachments
    (ticket_id, message_id, media_file_id, uploaded_by)
  values (p_ticket_id, p_message_id, p_media_id, v_uid)
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function public.attach_to_ticket(uuid, uuid, uuid)
  from public, anon;
grant   execute on function public.attach_to_ticket(uuid, uuid, uuid)
  to authenticated;


/** مرفقات تذكرة — الصلاحية من RLS على `support_attachments` نفسها. */
create or replace function public.ticket_attachments(p_ticket_id uuid)
returns table (
  id uuid, message_id uuid, media_id uuid,
  mime_type text, size_bytes bigint, path text, created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.message_id, a.media_file_id,
         m.mime_type, m.size_bytes, m.path, a.created_at
    from public.support_attachments a
    join public.media_files m on m.id = a.media_file_id
   where a.ticket_id = p_ticket_id
     and m.status = 'ready'
   order by a.created_at;
$$;

grant execute on function public.ticket_attachments(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- ٥) فهرسان لهما فائدة فعلية
--
-- ★ `purge_old_tickets()` تحذف التذاكر المغلقة بالجملة شهريًا،
-- فتتتالى على `support_attachments`. وبلا فهرس على `ticket_id` يمسح
-- Postgres الجدول كاملًا **لكل صفّ يُحذف**. الجدول فارغ اليوم لأن
-- الميزة لم تكن موصولة؛ وهي تُوصَل الآن، فالفهرس يسبق البيانات لا
-- يلحقها. وكل جداول الدعم الشقيقة تحمل الفهرس نفسه.
-- ---------------------------------------------------------------------
create index if not exists support_attachments_ticket_idx
  on public.support_attachments (ticket_id, created_at);

create index if not exists support_attachments_message_idx
  on public.support_attachments (message_id)
  where message_id is not null;
