-- =====================================================================
-- 0052 تقوية أمنية (إضافية · لا تغيّر منطق عمل)
--
-- ثلاثة أمور كشفها التدقيق، ولا واحد منها «إيجابية كاذبة»:
-- =====================================================================

-- ---------------------------------------------------------------------
-- ١) إغراق الطلبات — لا حدّ على إنشاء الطلب
-- ---------------------------------------------------------------------
-- ★ الثغرة: `create_order` و`create_order_with_proof` ممنوحتان لـanon
-- (وهذا صحيح: الزائر يشتري بلا حساب)، وليس عليهما أيّ حدّ معدّل.
-- ومفتاح `idempotency_key` يمنع **التكرار** لا **الإغراق**: مفتاح
-- جديد في كل نداء ⇒ طلب جديد في كل نداء.
--
-- والطلب الواحد ليس صفًّا خاملًا: يحجز مخزونًا (`apply_inventory_movement`)،
-- وينشئ صفّ عميل، ويُطلق إشعارًا للتاجر، ويستهلك حصّة الطلبات الشهرية
-- في باقته. فمنافسٌ يكتب حلقة بسيطة يُفرغ مخزون متجر ويغرق صاحبه
-- بإشعارات ويحرق حصّته — بمفتاح `anon` المنشور في كل متصفّح.
--
-- ★ الحدّ في القاعدة لا في الواجهة: الدالة نفسها مكشوفة عبر PostgREST،
-- فحدٌّ في Server Action يُتجاوَز بنداء مباشر للـRPC. وهذا بالضبط سبب
-- وضعه هنا.
--
-- ★ ومحفّز AFTER لا BEFORE: الإدراج المكرّر بنفس المفتاح يسقط على
-- الفهرس الفريد قبل محفّزات AFTER، فلا يستهلك حصّة. أي أنّ إعادة
-- المحاولة عند انقطاع الشبكة لا تُعاقَب — يُحسب الطلب الحقيقي وحده.
create or replace function app.enforce_order_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
begin
  -- طلبات اللوحة من التاجر نفسه لا تُحدّ: هو صاحب المتجر لا زائر.
  if new.placed_via <> 'storefront' then
    return null;
  end if;

  -- هوية ثابتة للزائر: الحساب، وإلا توكن الجلسة، وإلا رقم الهاتف.
  -- ★ لا مفتاح عامّ بلا مميِّز: دلوٌ واحد لكل زوّار المتجر يجعل
  -- الحدّ نفسه سلاح حرمان خدمة — يكفي مهاجم واحد ليقفل الشراء
  -- على الجميع.
  v_actor := coalesce(new.customer_id::text,
                      nullif(new.guest_token, ''),
                      nullif(new.contact_phone, ''));
  if v_actor is null then
    return null;
  end if;

  if not public.check_rate_limit(
       'order:' || new.store_id::text || ':' || v_actor, 5, 600) then
    raise exception 'RATE_LIMITED: تجاوزت عدد الطلبات المسموح. حاول بعد قليل.'
      using errcode = 'P0001';
  end if;

  return null;
end;
$$;

drop trigger if exists orders_rate_limit on public.orders;
create trigger orders_rate_limit
  after insert on public.orders
  for each row execute function app.enforce_order_rate();

-- ---------------------------------------------------------------------
-- ٢) منح الكتابة الافتراضية لدور `anon`
-- ---------------------------------------------------------------------
-- ★ Supabase تمنح `anon` صلاحيات INSERT/UPDATE/DELETE على مستوى
-- الجدول افتراضيًا. التدقيق وجدها قائمة على **٥١ جدولًا**، فيها
-- `orders` و`payments` و`partner_payouts` و`profiles`
-- و`admin_members` و`admin_permissions` و`platform_settings`.
--
-- ★ هل هي ثغرة اليوم؟ لا: RLS مفعّلة على كل الجداول، ولا توجد
-- سياسة كتابة واحدة لدور `anon` (فُحص: صفر سياسات). فالكتابة
-- مرفوضة الآن.
--
-- ★ فلماذا تُسحب إذن؟ لأن المنح الباقي يجعل النظام على مسافة **خطأ
-- واحد** من الانكشاف: سياسة تُكتب يومًا لدور `public` بدل
-- `authenticated`، أو RLS تُعطَّل سهوًا على جدول واحد، فتُفتح
-- الكتابة فورًا لكل من يملك المفتاح المنشور. الدفاع لا يُبنى على
-- طبقة واحدة صحيحة.
--
-- ولا يكسر هذا شيئًا: كل كتابات الزائر (السلة · الطلب · الإيصال ·
-- الزيارة · الإحالة) تمرّ بدوال SECURITY DEFINER تعمل بصلاحية
-- مالكها، فلا تمسّ منح `anon` أصلًا.
revoke insert, update, delete, truncate on all tables in schema public from anon;

-- والجداول التي تُنشأ لاحقًا لا ترث المنح
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon;

-- ★ التسلسلات كذلك: `usage` عليها لا لزوم له بلا صلاحية إدراج.
revoke usage, update on all sequences in schema public from anon;
alter default privileges in schema public revoke usage on sequences from anon;

-- ---------------------------------------------------------------------
-- ٣) `store_team` — تثبيت الحاجز لا تغييره
-- ---------------------------------------------------------------------
-- ★ هذا العرض SECURITY DEFINER عن قصد: سياسات `profiles` لا تكشف
-- صفّ زميل، فبدونه لا يرى التاجر أسماء فريقه. وشرطه الداخلي صحيح
-- اليوم (يحصر الصفوف في صفّ المستخدم نفسه، أو متجر يملك فيه
-- `members:view`، أو موظّف منصّة). و`anon` لا يقرؤه أصلًا.
--
-- ★ لكنه الحاجز **الوحيد**: RLS متجاوَزة داخله، فتعديل مستقبلي
-- يوسّع الشرط يكشف فرق كل المتاجر دفعةً واحدة بلا شبكة أمان.
-- لذلك `security_barrier` يبقى مثبّتًا هنا صراحةً (يمنع دفع شرط
-- المستخدم قبل شرط الأمان)، والاختبار 113 يحرس السلوك في كل بناء.
alter view public.store_team set (security_barrier = true);

comment on view public.store_team is
  'عرض SECURITY DEFINER مقصود: يضمّ أسماء الفريق التي تحجبها سياسات profiles. '
  'شرطه الداخلي هو حاجز العزل الوحيد — لا يُوسَّع بلا اختبار في 113.';
