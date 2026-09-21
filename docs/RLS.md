# 4. RLS & Tenant Isolation — عزل المتاجر على مستوى قاعدة البيانات

> الهدف غير القابل للتفاوض: **يستحيل** على مستخدم من متجر A الوصول إلى
> بيانات متجر B بتغيير معرّف في URL أو Request أو باستدعاء PostgREST
> مباشرة بمفتاح anon.

## 4.1 المبادئ

1. **RLS مفعّل على كل جدول**، والافتراضي منع (`revoke all` ثم سياسات صريحة).
2. **`FORCE ROW LEVEL SECURITY`** على الجداول المالية حتى لا يتجاوزها مالك الجدول.
3. **لا سياسة ارتدادية**: أي سياسة تحتاج معرفة دور المستخدم تستدعي دالة
   `SECURITY DEFINER` في سكيمة `app` — لا تستعلم من الجدول نفسه
   (إصلاح مباشر لثغرة S1).
4. **`(select auth.uid())`** لا `auth.uid()` — لتُقيَّم مرة واحدة كـInitPlan
   بدل مرة لكل صف (إصلاح S7).
5. **فصل السياسات بالأمر**: سياسات منفصلة لـ`select` / `insert` /
   `update` / `delete` — **ممنوع `for all`** (هو سبب ثغرة S3).
6. **الكتابة المالية لا سياسة لها إطلاقًا** — تُكتب حصريًا عبر دوال
   `security definer` مدقَّقة.
7. RLS هي **الجدار الثاني**؛ الجدار الأول هو `authorize()` في الخادم.

---

## 4.2 سكيمة `app` — دوال المساعدة

```sql
create schema app;
revoke all on schema app from public, anon, authenticated;
-- غير مكشوفة عبر PostgREST (ليست ضمن exposed schemas)

-- عضوية المتجر + الصلاحية المطلوبة، في استدعاء واحد مفهرس
create or replace function app.has_store_permission(
  p_store_id uuid, p_permission text
) returns boolean
language sql stable security definer set search_path = app, public as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = p_store_id
      and m.profile_id = (select auth.uid())
      and m.status = 'active'
      and m.deleted_at is null
      and ( m.role = 'owner'
            or p_permission = any(m.permissions)
            or p_permission = any(app.role_default_permissions(m.role)) )
  );
$$;

create or replace function app.is_store_member(p_store_id uuid) returns boolean ...
create or replace function app.is_store_owner(p_store_id uuid)  returns boolean ...

-- صلاحية موظف المنصة على قسم بمستوى معيّن
create or replace function app.has_platform_permission(
  p_section public.admin_section, p_level public.admin_level
) returns boolean
language sql stable security definer set search_path = app, public as $$
  select exists (
    select 1
    from public.admin_members am
    join public.admin_permissions ap on ap.admin_member_id = am.id
    where am.profile_id = (select auth.uid())
      and am.status = 'active'
      and ap.section = p_section
      and app.level_rank(ap.level) >= app.level_rank(p_level)
  );
$$;

create or replace function app.current_partner_id() returns uuid ...
create or replace function app.owns_customer_record(p_customer_id uuid) returns boolean ...

revoke execute on all functions in schema app from public, anon, authenticated;
grant  execute on all functions in schema app to authenticated;
```

**لماذا `security definer`؟** لأن الدالة تقرأ `store_members` /
`admin_members` بتجاوز RLS، فلا تنشأ حلقة «سياسة تستدعي سياسة». وهي
`stable` ⇒ يستدعيها المخطِّط مرة لكل استعلام لا لكل صف.

**فهرس داعم إلزامي:**
`create index on store_members (profile_id, store_id) where status='active' and deleted_at is null;`

---

## 4.3 نمط السياسة القياسي لجدول مستأجَر

مثال `products` (وينطبق نفسه على categories/variants/coupons/promotions/…):

```sql
alter table products enable row level security;

-- 1) قراءة عامة للزبائن: منتج منشور في متجر نشط فقط
create policy products_public_read on products for select to anon, authenticated
using (
  status = 'active' and deleted_at is null
  and exists (select 1 from stores s
              where s.id = products.store_id
                and s.status = 'active' and s.deleted_at is null)
);

-- 2) أعضاء المتجر: يرون كل منتجات متجرهم (بما فيها المسودات)
create policy products_member_read on products for select to authenticated
using ( app.has_store_permission(store_id, 'products:view') );

create policy products_member_insert on products for insert to authenticated
with check ( app.has_store_permission(store_id, 'products:create') );

create policy products_member_update on products for update to authenticated
using      ( app.has_store_permission(store_id, 'products:update') )
with check ( app.has_store_permission(store_id, 'products:update') );

create policy products_member_delete on products for delete to authenticated
using ( app.has_store_permission(store_id, 'products:delete') );

-- 3) موظفو المنصة: بمستوى الصلاحية فقط، لا لمجرد دخولهم /admin
create policy products_platform_read on products for select to authenticated
using ( app.has_platform_permission('products', 'view') );
```

> `with check` على `update` إلزامي: بدونه يستطيع عضو متجر A تعديل صف
> وتحويل `store_id` إلى B — وهو تسريب عابر للمستأجرين كلاسيكي.

**حماية إضافية بـtrigger:** `store_id` عمود غير قابل للتغيير على كل جدول
مستأجَر (`BEFORE UPDATE ... IF new.store_id <> old.store_id THEN RAISE`).

---

## 4.4 مصفوفة عزل المستأجرين

| الجدول | مفتاح العزل | قراءة عامة؟ |
|---|---|---|
| stores | `id` | ✅ النشطة فقط |
| store_settings | `store_id` | ⚠️ جزئي — عبر VIEW عام يستثني `bank_accounts` |
| store_domains | `store_id` | ❌ |
| store_members / invitations | `store_id` | ❌ |
| delivery_zones | `store_id` | ✅ النشطة (لحساب التوصيل في Checkout) |
| categories / products / variants / images | `store_id` | ✅ المنشور في متجر نشط |
| inventory / inventory_movements | `store_id` | ❌ (تُعرض «متوفر/نفد» فقط عبر VIEW) |
| customers / addresses | `store_id` | ❌ — العميل يرى سجله هو فقط |
| carts / cart_items / wishlists | `store_id` + مالك | ❌ |
| orders / order_items / status_history | `store_id` | ❌ — العميل يرى طلبه هو |
| payments / refunds | `store_id` | ❌ |
| ledger_entries | `account_kind`+`account_id` | ❌ |
| invoices | `store_id` | ❌ |
| subscriptions / requests / events | `store_id` | ❌ |
| coupons / redemptions / promotions | `store_id` | جزئي (تُتحقق الكوبونات عبر RPC، **لا تُقرأ مباشرة**) |
| partners / referrals / commission_ledger / payouts | `partner_id` | ❌ |
| support_* | `requester_id` / `store_id` | ❌ |
| notifications | `user_id` | ❌ |
| media_files | `store_id` + `owner_profile_id` | حسب الـbucket |
| audit_logs | `store_id` | ❌ |
| feature_flags / plans / plan_entitlements | عام (قراءة) | ✅ |

---

## 4.5 قواعد خاصة بجداول حسّاسة

### الجداول الإلحاقية (`ledger_entries`, `commission_ledger`, `audit_logs`, `inventory_movements`, `order_status_history`)
```sql
alter table ledger_entries enable row level security, force row level security;
-- سياسات SELECT فقط. لا INSERT/UPDATE/DELETE لأي دور.
revoke insert, update, delete on ledger_entries from anon, authenticated;

create or replace function app.block_mutation() returns trigger
language plpgsql as $$ begin
  raise exception 'immutable record: % is append-only', TG_TABLE_NAME
    using errcode = '42501';
end $$;

create trigger no_update before update on ledger_entries
  for each row execute function app.block_mutation();
create trigger no_delete before delete on ledger_entries
  for each row execute function app.block_mutation();
```
الكتابة الوحيدة: دوال `security definer` (`post_payment`, `post_commission_for_payment`,
`reverse_commission`, `mark_payout_paid`) التي تعمل بصلاحية المالك.

### `support_internal_notes`
```sql
create policy notes_staff_read on support_internal_notes for select to authenticated
using ( app.has_platform_permission('support', 'view') );
```
**لا توجد أي سياسة تمنح صاحب التذكرة القراءة** ⇒ يستحيل تسريب الملاحظات
الداخلية حتى لو أخطأ استعلام في الواجهة.

### `coupons`
لا قراءة عامة. التحقق يتم عبر `validate_coupon(store_id, code, cart)`
بـ`security definer` تُرجع **مبلغ الخصم فقط**، لا صف الكوبون ⇒ لا تعداد
أكواد ولا كشف شروط.

### `profiles`
```sql
create policy profiles_self on profiles for select to authenticated
  using ( id = (select auth.uid()) );
create policy profiles_platform on profiles for select to authenticated
  using ( app.has_platform_permission('users', 'view') );   -- ✅ لا ارتداد
```
قراءة التاجر لبيانات موظفيه تمرّ عبر VIEW `store_member_profiles` يكشف
`full_name` فقط — لا الهاتف ولا البريد.

### `storage.objects`
راجع [`STORAGE.md`](./STORAGE.md) — السياسات مبنية على أول جزء من المسار
(`stores/<store_id>/…`) عبر `app.has_store_permission`.

---

## 4.6 منع تصعيد الصلاحيات (Privilege Escalation)

| ناقل الهجوم | الحاجز |
|---|---|
| ترقية النفس إلى admin | لا عمود `role` في `profiles` أصلًا؛ `admin_members` بلا سياسة `insert` لغير `is_owner` |
| ترقية الدور داخل متجر | trigger على `store_members`: لا يمكن لعضو تعديل صفه هو، ولا منح دور أعلى من دوره |
| حقن `role` في `raw_user_meta_data` عند التسجيل | `handle_new_user()` **لا يقرأ أي دور من البيانات الوصفية**؛ الأدوار تُمنح لاحقًا بعملية مدقَّقة |
| تغيير `store_id` في صف موجود | `with check` + trigger عدم قابلية التغيير |
| تعديل `partners.commission_rate` | trigger: Admin بصلاحية `commissions:manage` فقط |
| تعديل مبالغ الدفع بعد `paid` | trigger رفض |
| إدراج في Ledger مباشرة | لا سياسة INSERT + REVOKE |
| تجاوز الحدود بالضرب على PostgREST | الحدود تُفرض داخل RPC الإنشاء، لا في الواجهة |
| قراءة جدول عبر anon key مباشرة | كل جدول خاص بلا سياسة لدور `anon` |

---

## 4.7 اختبارات RLS الإلزامية

تُنفَّذ بـ`pgTAP` داخل القاعدة (تشغيل حقيقي، لا محاكاة) — راجع
[`TESTING.md`](./TESTING.md):

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<owner-of-store-A>"}';
select is_empty(
  $$ select id from products where store_id = '<store-B>' $$,
  'مالك A لا يرى منتجات B'
);
select throws_ok(
  $$ update orders set status='completed' where store_id='<store-B>' $$
);
```

**قائمة الحالات الدنيا (تُشتق آليًا لكل جدول مستأجَر):**
1. عضو A لا يرى أي صف من B — لكل جدول في مصفوفة 4.4.
2. عضو A لا يُدرج صفًا بـ`store_id = B`.
3. عضو A لا يحوّل صفًا من A إلى B عبر UPDATE.
4. موظف `customer_service` لا يحذف منتجًا ولا يرى `cost_price` ولا `bank_accounts`.
5. `anon` لا يقرأ: orders · payments · customers · ledger · support · audit.
6. صاحب التذكرة لا يقرأ `support_internal_notes` بأي شكل.
7. موظف Admin بصلاحية `support:view` فقط لا يقرأ `payments` ولا `commission_ledger`.
8. لا أحد — بأي دور — ينجح في `UPDATE`/`DELETE` على `ledger_entries` أو
   `commission_ledger` أو `audit_logs`.
9. شريك لا يرى عمولات شريك آخر ولا بيانات المتجر التفصيلية.
10. عميل متجر A لا يُدرج تقييمًا/طلبًا بـ`store_id = B`.
