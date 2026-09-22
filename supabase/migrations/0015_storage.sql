-- =====================================================================
-- 0015 Storage — Buckets وسياساتها (إضافية)
--
-- STORAGE.md: فصل الأصول العامة عن الملفات الحساسة **بجدولين
-- مختلفين من الـbuckets** لا بأعمدة، لأن سياسات التخزين تعمل على
-- مستوى الكائن لا العمود.
--
-- اتفاقية المسار: الجزء الثاني هو معرّف المالك دائمًا
--   stores/<store_id>/...   ·   tickets/<ticket_id>/...   ·   users/<uid>/...
-- وكل السياسات مبنية عليه.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('store-public', 'store-public', true,  5242880,
   array['image/jpeg','image/png','image/webp','image/avif']),
  ('store-private', 'store-private', false, 10485760,
   array['image/jpeg','image/png','image/webp','application/pdf','text/csv',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('support-attachments', 'support-attachments', false, 10485760,
   array['image/jpeg','image/png','image/webp','application/pdf','text/plain']),
  ('avatars', 'avatars', true, 2097152,
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ملاحظة أمنية: image/svg+xml **غير مدرج** في أي bucket — SVG ناقل
-- XSS لأنه يحمل سكربتات (SECURITY.md §16.8).

-- ---------------------------------------------------------------------
-- store-public — قراءة عامة لمتجر نشط، وكتابة لعضو مخوّل
-- ---------------------------------------------------------------------
create policy "store_public_read" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'store-public'
    and (storage.foldername(name))[1] = 'stores'
    and app.is_store_public(((storage.foldername(name))[2])::uuid)
  );

create policy "store_public_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'store-public'
    and (storage.foldername(name))[1] = 'stores'
    and app.has_store_permission(((storage.foldername(name))[2])::uuid, 'products:update')
  );

create policy "store_public_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'store-public'
    and app.has_store_permission(((storage.foldername(name))[2])::uuid, 'products:update')
  );

create policy "store_public_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'store-public'
    and app.has_store_permission(((storage.foldername(name))[2])::uuid, 'products:delete')
  );

-- ---------------------------------------------------------------------
-- store-private — لا anon إطلاقًا. إثباتات التحويل والاستيراد.
-- ---------------------------------------------------------------------
create policy "store_private_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'store-private'
    and (storage.foldername(name))[1] = 'stores'
    and (
      app.has_store_permission(((storage.foldername(name))[2])::uuid, 'settings:view')
      or app.has_platform_permission('payments', 'view')
    )
  );

create policy "store_private_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'store-private'
    and (storage.foldername(name))[1] = 'stores'
    and app.has_store_permission(((storage.foldername(name))[2])::uuid, 'settings:view')
  );

-- لا UPDATE ولا DELETE: إثبات التحويل سجل مالي لا يُستبدل ولا يُحذف
-- (المواصفات §34 · D32).

-- ---------------------------------------------------------------------
-- support-attachments — صاحب التذكرة أو فريق الدعم فقط
-- ---------------------------------------------------------------------
create policy "support_attach_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = 'tickets'
    and exists (
      select 1 from public.support_tickets t
      where t.id = ((storage.foldername(name))[2])::uuid
        and (t.requester_id = (select auth.uid())
             or app.has_platform_permission('support', 'view'))
    )
  );

create policy "support_attach_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = 'tickets'
    and exists (
      select 1 from public.support_tickets t
      where t.id = ((storage.foldername(name))[2])::uuid
        and (t.requester_id = (select auth.uid())
             or app.has_platform_permission('support', 'edit'))
    )
  );

-- ---------------------------------------------------------------------
-- avatars — كل مستخدم في مجلده
-- ---------------------------------------------------------------------
create policy "avatar_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');

create policy "avatar_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "avatar_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- =====================================================================
-- تسجيل الملف + فرض حصة التخزين
-- =====================================================================

/**
 * يُنادى قبل الرفع. يتحقق من الصلاحية والنوع والحجم وحد الباقة،
 * ويعيد المسار الذي يجب الرفع إليه.
 *
 * ★ اسم الملف يُولَّد خادميًا (UUID) ولا يأتي من المستخدم إطلاقًا ⇒
 * لا Path Traversal ولا تصادم أسماء ولا تسريب اسم أصلي.
 */
create or replace function public.prepare_upload(
  p_store_id  uuid,
  p_purpose   public.media_purpose,
  p_mime      text,
  p_size      bigint,
  p_ext       text default null
)
returns table (media_id uuid, bucket text, path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket text;
  v_allowed text[];
  v_limit bigint;
  v_id uuid := gen_random_uuid();
  v_ext text := lower(coalesce(nullif(trim(p_ext), ''), 'bin'));
  v_path text;
  v_perm text;
begin
  -- 1) الـbucket حسب الغرض
  v_bucket := case p_purpose
    when 'product_image'   then 'store-public'
    when 'store_logo'      then 'store-public'
    when 'store_banner'    then 'store-public'
    when 'category_image'  then 'store-public'
    when 'payment_proof'   then 'store-private'
    when 'import_file'     then 'store-private'
    when 'export_file'     then 'store-private'
    when 'avatar'          then 'avatars'
    else null
  end;
  if v_bucket is null then
    raise exception 'INVALID_PURPOSE' using errcode = 'P0001';
  end if;

  -- 2) الصلاحية المطلوبة حسب الغرض
  v_perm := case p_purpose
    when 'payment_proof' then 'settings:view'
    when 'import_file'   then 'products:create'
    when 'export_file'   then 'export:data'
    else 'products:update'
  end;
  if not app.has_store_permission(p_store_id, v_perm) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- 3) النوع والحجم من إعداد الـbucket نفسه (مصدر واحد)
  select allowed_mime_types, file_size_limit into v_allowed, v_limit
    from storage.buckets where id = v_bucket;

  if v_allowed is not null and not (p_mime = any(v_allowed)) then
    raise exception 'INVALID_MIME: نوع الملف غير مسموح' using errcode = 'P0001';
  end if;
  if v_limit is not null and p_size > v_limit then
    raise exception 'FILE_TOO_LARGE: حجم الملف يتجاوز الحد المسموح'
      using errcode = 'P0001';
  end if;
  if p_size <= 0 then
    raise exception 'INVALID_SIZE' using errcode = 'P0001';
  end if;

  -- 4) حصة التخزين من الباقة
  perform app.assert_within_limit(p_store_id, 'storage.mb');

  -- 5) المسار — اسم عشوائي خادمي
  v_path := 'stores/' || p_store_id::text || '/' ||
            case p_purpose
              when 'store_logo'     then 'logo'
              when 'store_banner'   then 'banners'
              when 'product_image'  then 'products'
              when 'category_image' then 'categories'
              when 'payment_proof'  then 'payment-proofs'
              when 'import_file'    then 'imports'
              when 'export_file'    then 'exports'
              else 'misc'
            end || '/' || v_id::text || '.' || v_ext;

  insert into public.media_files
    (id, bucket, path, owner_profile_id, store_id, purpose, mime_type, size_bytes, status)
  values (v_id, v_bucket, v_path, (select auth.uid()), p_store_id,
          p_purpose, p_mime, p_size, 'pending');

  return query select v_id, v_bucket, v_path;
end;
$$;

revoke execute on function public.prepare_upload(uuid, public.media_purpose, text, bigint, text)
  from public, anon;
grant execute on function public.prepare_upload(uuid, public.media_purpose, text, bigint, text)
  to authenticated;

/** يُنادى بعد نجاح الرفع: يوسم الملف جاهزًا ويحفظ الأبعاد. */
create or replace function public.finalize_upload(
  p_media_id uuid,
  p_width    integer default null,
  p_height   integer default null,
  p_blur     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_store uuid;
begin
  select store_id into v_store from public.media_files where id = p_media_id;
  if v_store is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if not app.has_store_permission(v_store, 'products:update')
     and not app.has_store_permission(v_store, 'settings:view') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.media_files
     set status = 'ready', width = p_width, height = p_height,
         blur_data_url = p_blur
   where id = p_media_id and status = 'pending';
end;
$$;

revoke execute on function public.finalize_upload(uuid, integer, integer, text) from public, anon;
grant   execute on function public.finalize_upload(uuid, integer, integer, text) to authenticated;
