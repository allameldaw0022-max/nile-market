# 3. Database Schema — مخطط قاعدة البيانات

> PostgreSQL 17 على Supabase. كل الجداول في `public` ما لم يُذكر غير ذلك.
> سكيمة `app` خاصة (غير مكشوفة عبر PostgREST) لدوال المساعدة الأمنية.

## 3.0 اتفاقيات عامة

| البند | القاعدة |
|---|---|
| المفتاح الأساسي | `id uuid primary key default gen_random_uuid()` |
| الطوابع | `created_at timestamptz not null default now()` · `updated_at` بـtrigger |
| الأموال | `numeric(14,2)` — **ممنوع** float |
| العملة | `currency char(3) not null default 'SDG'` على الجداول المالية |
| Soft delete | `deleted_at timestamptz` على: المنتجات، التصنيفات، الكوبونات، العروض، الموظفين، العملاء، الملفات. **لا** soft delete على السجلات المالية (لا تُحذف إطلاقًا) |
| ملكية المستأجر | `store_id uuid not null references stores(id)` على كل جدول مستأجَر |
| الحذف | `on delete restrict` لكل ما يمسّ المال أو التاريخ؛ `cascade` فقط للبيانات التابعة البحتة |
| RLS | مفعّل على **كل** جدول، والافتراضي = منع |
| الفهارس | فهرس على كل FK يُستعلم به، وفهرس مركّب `(store_id, <العمود الشائع>)` |
| التدقيق | كل جدول حسّاس يُسجَّل تغييره في `audit_logs` من داخل القاعدة |

---

## 3.1 الهوية والحسابات

### `profiles`
هوية المستخدم على مستوى المنصة (مرآة لـ`auth.users`).

| العمود | النوع | ملاحظات |
|---|---|---|
| `id` | uuid PK | → `auth.users(id)` on delete cascade |
| `full_name` | text | |
| `phone` | text | |
| `avatar_url` | text | |
| `locale` | text default `'ar'` | |
| `account_status` | enum `account_status` | `active` · `suspended` · `closed` |
| `is_platform_staff` | boolean default false | بوابة دخول `/admin` فقط — التفصيل في `admin_members` |
| `email_verified_at` | timestamptz | مشتق من `auth.users` |
| `last_seen_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

- **فهارس:** `(is_platform_staff) where is_platform_staff`
- **حساس:** `phone`. لا يُقرأ إلا بصلاحية صريحة.
- **مهم:** لا عمود `role` عام بعد الآن. الدور **سياقي**: داخل متجر عبر
  `store_members`، وفي المنصة عبر `admin_members`، وكشريك عبر `partners`.
  هذا يقتل فئة كاملة من أخطاء تصعيد الصلاحيات.

### `user_sessions_meta`
دعم «مركز الأمان» (§29): الأجهزة وآخر عمليات الدخول.

| العمود | النوع |
|---|---|
| `id` uuid PK · `user_id` uuid → profiles | |
| `ip_hash` text · `user_agent` text · `device_label` text | |
| `last_active_at` · `revoked_at` timestamptz | |

### `admin_members` · `admin_permissions`
موظفو لوحة Admin وصلاحياتهم حسب الأقسام.

`admin_members`: `id`, `profile_id` (unique), `display_name`,
`status` (`active`/`suspended`), `is_owner` bool, `created_by`,
`created_at`, `last_active_at`.

`admin_permissions`: `id`, `admin_member_id`, `section` enum
`admin_section`, `level` enum `admin_level`, **unique (admin_member_id, section)**.

- `admin_section` = `dashboard, merchants, stores, users, employees, orders,
  products, customers, plans, subscriptions, payments, commissions, partners,
  payouts, domains, notifications, support, reports, security, audit_logs,
  feature_flags, system_health, maintenance, settings, content`
- `admin_level` = `none, view, create, edit, delete, approve, manage`
  (تراكمي تصاعديًا، و`approve` منفصل منطقيًا ويُمنح صراحة)

---

## 3.2 المتاجر (المستأجر)

### `stores`
| العمود | النوع | ملاحظات |
|---|---|---|
| `id` uuid PK | | **معرّف المستأجر** |
| `owner_id` uuid | → profiles, `on delete restrict` | لا يُحذف تاجر وله متجر |
| `name` text not null | | **لا** قيد فريد (إصلاح S9) |
| `slug` citext not null **unique** | | يُتحقق من `reserved_slugs` |
| `business_type` text | | |
| `description` text · `logo_url` · `banner_url` | | |
| `status` enum `store_status` | `draft, pending_review, active, closed, suspended` | |
| `suspended_reason` text · `suspended_at` | | |
| `published_at` timestamptz | | |
| `referred_by_partner_id` uuid | → partners, nullable | **لا يُعدَّل من واجهة التاجر إطلاقًا** |
| `created_at` / `updated_at` / `deleted_at` | | |

**فهارس:** `unique(lower(slug))`, `(owner_id)`, `(status)`, `(referred_by_partner_id)`

### `reserved_slugs`
`slug citext PK` — `admin, app, api, support, help, www, mail, blog, cdn,
static, assets, dashboard, partner, account, login, signup, status, docs…`

### `store_settings`
صف واحد لكل متجر (1:1) — يمنع تضخّم `stores`.

`store_id` PK→stores · `whatsapp_number` · `contact_email` · `contact_phone`
· `address` jsonb · `social_links` jsonb · `theme` jsonb (ألوان ثانوية
مقيّدة بقائمة مسموحة) · `cod_enabled` bool · `bank_transfer_enabled` bool
· `bank_accounts` jsonb 🔒 · `low_stock_threshold` int default 5
· `auto_hide_out_of_stock` bool default true · `order_prefix` text
· `seo` jsonb (title/description/og_image) · `policies` jsonb
(return/shipping/privacy/terms) · `notification_prefs` jsonb
· `maintenance_mode` bool · `created_at`/`updated_at`

🔒 `bank_accounts` حساس: يُقرأ فقط بصلاحية `settings:view` داخل المتجر.

### `store_members`
الموظفون والصلاحيات داخل المتجر (**بديل `store_employees` الحالي**).

| العمود | النوع |
|---|---|
| `id` uuid PK · `store_id` → stores · `profile_id` → profiles |
| `role` enum `store_role` = `owner, manager, orders, products, customer_service` |
| `permissions` text[] — تجاوزات دقيقة فوق الدور (قابلية التوسع §18) |
| `status` = `invited, active, suspended` |
| `invited_by` uuid · `invited_at` · `accepted_at` · `deleted_at` |
| **unique (store_id, profile_id)** |

**قاعدة صلبة:** صف `owner` واحد فقط لكل متجر، ويجب أن يطابق
`stores.owner_id` — trigger يفرض ذلك ويمنع حذفه أو خفضه.

### `store_invitations`
يستبدل `find_profile_id_by_email` (إصلاح S5).
`id` · `store_id` · `email citext` · `role` · `token_hash` (sha256، **لا
يُخزَّن التوكن الخام**) · `expires_at` · `accepted_at` · `created_by`
· unique `(store_id, email) where accepted_at is null`

### `store_domains`
| العمود | النوع | ملاحظات |
|---|---|---|
| `id` uuid PK · `store_id` → stores | | |
| `hostname` citext **unique globally** | | 🔑 منع اختطاف الدومين |
| `kind` enum | `subdomain` · `custom` | |
| `status` enum `domain_status` | `pending, verification_required, verifying, active, ssl_pending, ssl_active, failed, suspended, removed` | |
| `is_primary` boolean | unique جزئي `(store_id) where is_primary` | |
| `verification_token` text · `verification_method` (`dns_txt`/`cname`) | | |
| `verified_at` · `last_checked_at` · `failure_reason` | | |
| `redirect_www` boolean default true | | |
| `released_at` timestamptz | | بعد الإزالة يبقى الصف لمنع إعادة الاستخدام بلا تحقق |

**فهارس:** `unique(lower(hostname))`, `(store_id)`, `(status)`

### `delivery_zones`
يُصلح ثغرة S2 (رسوم التوصيل من المتصفح).
`id` · `store_id` · `name` (مدينة/منطقة) · `fee numeric(14,2)` ·
`min_order_free numeric(14,2)` nullable · `est_days_min/max` int ·
`is_active` · `sort_order` · unique `(store_id, lower(name))`

---

## 3.3 الكتالوج

### `categories`
`id` · `store_id` · `parent_id` (self, nullable) · `name` · `slug citext`
· `image_url` · `sort_order` · `is_active` · `deleted_at`
· unique `(store_id, lower(slug))` · فهرس `(store_id, parent_id)`

### `products`
| العمود | النوع | ملاحظات |
|---|---|---|
| `id` · `store_id` · `category_id` (nullable) | | |
| `name` · `slug citext` · `description` text | | unique `(store_id, lower(slug))` |
| `price` numeric(14,2) `check >= 0` | | السعر الأساسي |
| `compare_at_price` numeric(14,2) | | سعر قبل الخصم |
| `cost_price` numeric(14,2) 🔒 | | لا يظهر للزبون أبدًا |
| `sku` text | | unique `(store_id, sku) where sku is not null` |
| `status` enum `product_status` | `draft, active, hidden, archived` | |
| `has_variants` boolean | | |
| `track_inventory` boolean default true | | |
| `weight_grams` int · `seo` jsonb · `attributes` jsonb | | |
| `views_count` int · `sold_count` int | | تُحدَّث بـtrigger/job لا بـSELECT |
| `published_at` · `deleted_at` | | |

**فهارس:** `(store_id, status) where deleted_at is null`,
`(store_id, category_id)`, GIN على `to_tsvector('arabic', name || description)`
للبحث، `(store_id, created_at desc)`

### `product_images`
`id` · `product_id` · `media_file_id` → media_files · `alt_text` ·
`sort_order` · `is_primary` — (يستبدل `images jsonb` بمرجع حقيقي للملف)

### `product_variants`
`id` · `product_id` · `store_id` (مكرر عمدًا لتبسيط RLS والفهرسة) ·
`name` · `sku` · `price` numeric(14,2) nullable (fallback لسعر المنتج) ·
`compare_at_price` · `options jsonb` (`{"اللون":"أحمر","المقاس":"L"}`) ·
`image_id` · `is_active` · `deleted_at`
· unique `(product_id, options)` · unique `(store_id, sku) where sku is not null`

### `inventory`
مستوى المخزون الحالي — صف لكل (منتج، متغيّر|null).
`id` · `store_id` · `product_id` · `variant_id` nullable ·
`quantity int not null default 0` · `reserved int not null default 0` ·
`low_stock_threshold int` · `updated_at`
· **unique `(product_id, coalesce(variant_id,'00000000-…'::uuid))`**

> `quantity` **لا يُعدَّل مباشرة أبدًا** — فقط عبر `inventory_movements`
> بـtrigger يجمع. هذا يُلغي التلاعب من الواجهة (§12).

### `inventory_movements` (إلحاقي)
`id` · `store_id` · `product_id` · `variant_id` · `delta int not null` ·
`reason` enum (`manual_adjust, order_placed, order_cancelled,
order_returned, import, correction`) · `order_id` nullable ·
`actor_id` · `note` · `created_at`
· فهرس `(store_id, created_at desc)`, `(product_id)`

---

## 3.4 العملاء والسلة

### `customers`
سجل العميل **داخل متجر واحد** (يحقق العزل — سؤال Q8).
`id` · `store_id` · `profile_id` nullable (زائر بلا حساب) ·
`name` · `phone` · `email citext` nullable · `notes` 🔒 ·
`orders_count` · `total_spent numeric(14,2)` · `first_order_at` ·
`last_order_at` · `marketing_consent` bool · `deleted_at`
· unique `(store_id, profile_id) where profile_id is not null`
· unique `(store_id, phone) where phone is not null`

### `customer_addresses`
`id` · `customer_id` · `store_id` · `label` · `recipient_name` ·
`phone` · `zone_id` → delivery_zones · `address_line` · `landmark` ·
`is_default`

### `carts` · `cart_items`
`carts`: `id` · `store_id` · `profile_id` nullable · `anon_token` text
nullable (كوكي HttpOnly) · `status` (`active`,`converted`,`abandoned`) ·
`expires_at` · unique `(store_id, profile_id) where status='active'`

`cart_items`: `id` · `cart_id` · `product_id` · `variant_id` ·
`quantity int check > 0` · `added_at` · unique `(cart_id, product_id, variant_id)`

> **سلة لكل متجر** — لا سلة عابرة للمتاجر. الدمج عند تسجيل الدخول يتم
> بـ`UPSERT` على المفتاح الفريد ⇒ لا تكرار عناصر ولا فقدان سلة (§20 من الإضافات).

### `wishlists`
`id` · `store_id` · `profile_id` · `product_id` · unique الثلاثي

---

## 3.5 الطلبات

### `orders`
| العمود | النوع | ملاحظات |
|---|---|---|
| `id` uuid PK | | |
| `store_id` → stores **not null** | | ★ الطلب ملك متجر واحد |
| `order_number` text not null | | unique `(store_id, order_number)` — من `store_order_sequences` |
| `customer_id` → customers nullable | | Guest Checkout مدعوم |
| `contact_name` · `contact_phone` not null · `contact_email` | | لقطة وقت الطلب |
| `delivery_zone_id` · `delivery_address` jsonb | | لقطة |
| `status` enum `order_status` | `new, confirmed, preparing, shipped, completed, cancelled` | ★ يطابق §13 |
| `payment_status` enum | `unpaid, pending, partially_paid, paid, refunded, partially_refunded` | |
| `payment_method` enum | `cash_on_delivery, bank_transfer, bankak` | |
| `subtotal` · `delivery_fee` · `discount_total` · `total` | numeric(14,2) | **كلها تُحسب في `create_order` من القاعدة** |
| `paid_total` · `refunded_total` | numeric(14,2) default 0 | مشتق من `payments` بـtrigger |
| `coupon_id` nullable · `coupon_code` text | | لقطة الكود |
| `currency` char(3) default 'SDG' | | |
| `note` (من العميل) · `internal_note` 🔒 | | |
| `cancelled_reason` · `cancelled_at` · `completed_at` | | |
| `placed_via` enum | `storefront, whatsapp, dashboard` | |
| `idempotency_key` text | | unique `(store_id, idempotency_key)` — منع التكرار (§13) |
| `created_at` / `updated_at` | | |

**فهارس:** `(store_id, created_at desc)`, `(store_id, status)`,
`(customer_id)`, `(store_id, payment_status)`

### `store_order_sequences`
`store_id` PK · `next_number bigint not null default 1` — يُزاد بـ
`UPDATE … RETURNING` داخل المعاملة ⇒ أرقام متسلسلة بلا فجوات ولا سباق.

### `order_items`
`id` · `order_id` · `store_id` · `product_id` (`on delete restrict`) ·
`variant_id` · **`product_name`, `variant_name`, `sku`** (لقطة نصية تبقى
لو حُذف المنتج) · `unit_price` · `quantity` · `line_total` ·
`created_at`
> **لا حالة على السطر** — الحالة على مستوى الطلب (قرار ADR-7).

### `order_status_history` (إلحاقي)
`id` · `order_id` · `store_id` · `from_status` · `to_status` ·
`actor_id` nullable · `actor_kind` (`store`,`platform`,`system`,`customer`) ·
`reason` · `created_at` — كل انتقال يُسجَّل هنا بـtrigger، لا من الواجهة.

---

## 3.6 المال

### `payments`
منفصل عن الطلب (§13) ويخدم الطلبات **والاشتراكات**.

| العمود | النوع |
|---|---|
| `id` uuid PK |
| `kind` enum `payment_kind` = `order` · `subscription` |
| `store_id` → stores (nullable للمدفوعات على مستوى المنصة) |
| `order_id` nullable · `subscription_id` nullable — **check: واحد منهما فقط حسب `kind`** |
| `method` enum = `cash_on_delivery, bank_transfer, bankak` |
| `status` enum `payment_status` = `pending, paid, failed, refunded, partially_refunded` |
| `amount` numeric(14,2) `check > 0` · `currency` |
| `reference` text (رقم الحوالة/العملية) |
| `proof_media_id` → media_files 🔒 (إثبات التحويل) |
| `paid_at` · `failed_reason` |
| `confirmed_by` uuid · `confirmed_at` |
| `idempotency_key` text · **unique `(kind, idempotency_key)`** |
| `external_event_id` text · **unique** (منع تكرار Webhook مستقبلًا) |
| `created_at` / `updated_at` |

**قاعدة:** لا `DELETE` ولا `UPDATE` على `amount` بعد `paid` — trigger يرفض.

### `refunds`
`id` · `payment_id` → payments · `order_id`/`subscription_id` ·
`amount numeric(14,2) check > 0` · `reason` not null ·
`status` (`pending_review, approved, rejected, completed`) ·
`requested_by` · `approved_by` (**≠ requested_by** إن فُعِّل فصل المهام — Q9) ·
`approved_at` · `completed_at` · `idempotency_key` unique
· check: `sum(refunds.amount) <= payments.amount` بـtrigger

### `ledger_entries` (Append-only — قلب النظام المالي)
| العمود | النوع |
|---|---|
| `id` uuid PK |
| `account_kind` enum = `platform, store, partner` |
| `account_id` uuid nullable (store_id / partner_id / null للمنصة) |
| `entry_type` enum = `subscription_revenue, partner_commission, commission_reversal, partner_payout, refund, adjustment` |
| `direction` enum = `credit, debit` |
| `amount numeric(14,2) check > 0` · `currency` |
| `payment_id` · `refund_id` · `subscription_id` · `commission_id` · `payout_id` (مراجع اختيارية) |
| `reverses_entry_id` → ledger_entries (للقيود العكسية) |
| `memo` · `created_by` · `created_at` |

**الحماية:** `REVOKE UPDATE, DELETE` من كل الأدوار + trigger
`BEFORE UPDATE OR DELETE → RAISE EXCEPTION`. **العكس يتم بقيد مقابل، لا
بتعديل.** الرصيد = `SUM(credit) - SUM(debit)` عبر VIEW مُفهرس.

### `invoices`
`id` · `store_id` · `order_id`/`subscription_id` · `invoice_number` ·
`issued_at` · `snapshot jsonb` (بيانات المتجر والعميل والبنود وقت
الإصدار — لا تتغير لاحقًا مهما تغيّرت الجداول) · `total`

---

## 3.7 الاشتراكات

### `plans`
`id` · `code citext unique` (`free`,`basic`,`pro`,`trial`) · `name` ·
`description` · `price numeric(14,2)` · `billing_period` enum
(`monthly`,`yearly`) · `duration_days int` · `is_public bool`
(الـtrial غير عام) · `is_active` · `sort_order` · `created_at`/`updated_at`

### `plan_entitlements`
**صف لكل ميزة/حد** — يجعل الباقات قابلة للتعديل من Admin دون نشر كود.
`id` · `plan_id` · `feature_key` text · `limit_value int nullable`
(`null` = بلا حد) · `bool_value boolean nullable` ·
**unique `(plan_id, feature_key)`**

مفاتيح الميزات المعتمدة: `products.max`, `employees.max`,
`storage.mb`, `coupons.max_active`, `promotions.max_active`,
`custom_domain.enabled`, `analytics.advanced`, `import_export.enabled`,
`orders.monthly_max`, `variants.enabled`, `whatsapp.enabled`.

### `subscriptions`
`id` · `store_id` → stores · `plan_id` → plans (`on delete restrict`) ·
`status` enum `subscription_status` = `trialing, active, expiring,
grace, expired, suspended, cancelled` · `started_at` · `current_period_end`
· `grace_ends_at` · `cancel_requested_at` · `previous_plan_id` ·
`auto_renew bool` · `created_at`/`updated_at`
· unique `(store_id) where status <> 'cancelled'` — اشتراك فعّال واحد للمتجر

### `subscription_events` (إلحاقي)
`id` · `subscription_id` · `store_id` · `event` (`created, activated,
renewed, upgraded, downgraded, expiring_warned, entered_grace, expired,
suspended, reactivated, cancelled`) · `from_plan_id` · `to_plan_id` ·
`payment_id` · `actor_id` · `metadata jsonb` · `created_at`

### `subscription_requests`
طلب التاجر للاشتراك/التجديد مع إثبات التحويل (تدفق v1 اليدوي).
`id` · `store_id` · `plan_id` · `amount` · `discount_amount` ·
`net_amount` (المحسوب خادميًا) · `coupon_code` nullable ·
`proof_media_id` 🔒 · `status` (`pending, approved, rejected`) ·
`reviewed_by` · `reviewed_at` · `rejection_reason` · `idempotency_key` unique

---

## 3.8 الشركاء والعمولات

### `partners`
`id` · `profile_id` unique nullable (قبل قبول الدعوة) · `name` ·
`email citext` · `phone` · `status` (`invited, active, suspended`) ·
`referral_code citext unique` · `commission_rate numeric(5,2) not null
default 50.00` 🔒 · `payout_notes` · `created_by` · `created_at`

> `commission_rate` يُعدَّله Admin فقط (trigger حماية)، ويسري على
> **المستقبل فقط**؛ النسبة المستخدمة تُلقَّط في `commission_ledger`.

### `referral_visits`
`id` · `partner_id` · `visitor_token` · `landing_path` · `ip_hash` ·
`user_agent` · `created_at` — لتطبيق قاعدة الإسناد (Q5) خادميًا.

### `referrals`
الربط الدائم بين الشريك والمتجر.
`id` · `partner_id` → partners · `store_id` → stores **unique** ·
`attributed_at` · `attribution_source` (`link`,`code`,`admin_manual`) ·
`locked bool default true` · `created_at`
> **unique على `store_id`** ⇒ مستحيل بنيويًا أن يُنسب متجر لشريكين.

### `commission_ledger` (Append-only)
| العمود | النوع |
|---|---|
| `id` · `partner_id` · `store_id` · `referral_id` |
| `payment_id` → payments **unique مع `entry_kind='commission'`** ← منع الاحتساب مرتين |
| `subscription_id` |
| `entry_kind` enum = `commission` · `reversal` |
| `base_amount numeric(14,2)` — صافي المدفوع فعليًا بعد الخصم |
| `rate_applied numeric(5,2)` — لقطة النسبة وقت الاحتساب |
| `amount numeric(14,2)` — `round(base * rate/100, 2)` |
| `reverses_id` → commission_ledger (للعكس) |
| `refund_id` nullable · `status` enum = `pending, payable, paid, reversed` |
| `payout_id` → partner_payouts nullable |
| `created_at` |

**قيود الحماية:**
- `unique (payment_id) where entry_kind = 'commission'` — **الحاجز البنيوي ضد العمولة المكررة**
- `REVOKE UPDATE/DELETE` + trigger — العكس بصف جديد فقط
- تُكتب حصرًا من `post_commission_for_payment()` بـ`security definer`

### `partner_payouts`
`id` · `partner_id` · `amount numeric(14,2)` · `method` ·
`reference` (رقم الحوالة) · `status` (`pending_review, approved,
rejected, paid`) · `requested_by` · `approved_by` (**≠ requested_by** — Q9) ·
`paid_at` · `note` · `idempotency_key` unique · `created_at`

**الذرّية:** `mark_payout_paid()` يربط صفوف `commission_ledger` المحددة
بـ`payout_id` ويحوّلها إلى `paid` داخل نفس المعاملة ⇒ **استحالة الصرف
المزدوج** (صف مرتبط بـpayout لا يُلتقط مرة أخرى).

---

## 3.9 الكوبونات والعروض

### `coupons`
`id` · `store_id` · `code citext` · `type` (`percentage`,`fixed`) ·
`value numeric(14,2)` · `min_order_amount` · `max_discount_amount`
(سقف لنسبة مئوية) · `starts_at` · `ends_at` · `usage_limit_total int` ·
`usage_limit_per_customer int` · `used_count int` · `applies_to` jsonb
(كل المتجر / تصنيفات / منتجات) · `is_active` · `deleted_at`
· unique `(store_id, lower(code))`

### `coupon_redemptions`
`id` · `coupon_id` · `order_id` **unique** · `customer_id` ·
`discount_amount` · `created_at` — الفريد على `order_id` يمنع الاستخدام
المزدوج على نفس الطلب؛ العدّ لكل عميل يُحسب من هنا لا من `used_count`.

### `promotions`
`id` · `store_id` · `name` · `type` (`banner`,`featured`,`sale`) ·
`config jsonb` · `starts_at`/`ends_at` · `is_active` · `deleted_at`

---

## 3.10 الدعم

### `support_tickets`
`id` · `ticket_number` text unique · `requester_id` → profiles ·
`requester_kind` (`merchant`,`customer`,`partner`) · `store_id` nullable ·
`subject` · `category` enum (`technical, billing, subscription, orders,
domains, account, other`) · `priority` (`low, normal, high, urgent`) ·
`status` enum `ticket_status` = `new, open, in_progress,
waiting_customer, waiting_internal, resolved, closed` ·
`assigned_to` → admin_members · `related_order_id` · `related_payment_id` ·
`related_subscription_id` · `first_response_at` · `resolved_at` ·
`closed_at` · `last_message_at` · `created_at`/`updated_at`

**فهارس:** `(status, priority, created_at desc)`, `(requester_id)`, `(store_id)`, `(assigned_to)`

### `support_messages`
`id` · `ticket_id` · `author_id` · `author_kind` (`requester`,`staff`,`system`) ·
`body text` · `created_at` · فهرس `(ticket_id, created_at)`

### `support_internal_notes`
جدول **منفصل** (لا عمود `is_internal`) ⇒ لا يمكن تسريبه بخطأ استعلام واحد.
`id` · `ticket_id` · `author_id` → admin_members · `body` · `created_at`

### `support_attachments`
`id` · `ticket_id` · `message_id` nullable · `media_file_id` · `uploaded_by`

### `support_events`
`id` · `ticket_id` · `actor_id` · `event` (`assigned, status_changed,
priority_changed, category_changed, escalated`) · `from`/`to` · `created_at`

---

## 3.11 المنصة والنظام

### `media_files`
سجل موحّد لكل ملف مرفوع.
`id` · `bucket` · `path` unique · `owner_profile_id` · `store_id` nullable ·
`purpose` enum (`product_image, store_logo, store_banner, payment_proof,
support_attachment, import_file, export_file, avatar`) ·
`mime_type` · `size_bytes` · `width`/`height` · `checksum` ·
`status` (`pending, ready, quarantined, deleted`) · `created_at` · `deleted_at`

### `notifications`
`id` · `user_id` → profiles · `store_id` nullable · `type` text ·
`title` · `body` · `link` · `data jsonb` · `read_at` timestamptz ·
`dedupe_key` text · **unique `(user_id, dedupe_key) where dedupe_key is not null`**
· `created_at` · فهرس `(user_id, read_at, created_at desc)`

### `email_outbox`
`id` · `to_email` · `template` · `payload jsonb` · `status`
(`queued, sending, sent, failed`) · `attempts int` · `last_error` ·
`dedupe_key` unique · `scheduled_for` · `sent_at`

### `job_queue`
`id` · `kind` · `payload jsonb` · `status` (`queued, running, done, failed`) ·
`attempts` · `max_attempts` · `run_after` · `locked_at` · `locked_by` ·
`last_error` · `created_at` · فهرس `(status, run_after)`

### `audit_logs` (Append-only)
`id` · `actor_id` nullable · `actor_kind` (`store, platform, partner,
customer, system`) · `store_id` nullable · `action` text
(`product.price_changed`, `order.status_changed`, `payout.approved`…) ·
`resource_type` · `resource_id` · `before jsonb` 🔒 · `after jsonb` 🔒 ·
`ip_hash` · `user_agent` · `created_at`

- فهارس: `(store_id, created_at desc)`, `(actor_id, created_at desc)`, `(action)`
- `REVOKE UPDATE, DELETE` — **يُكتب من triggers داخل القاعدة**، لا من العميل (§30)

### `feature_flags`
`key` PK · `description` · `enabled bool` · `rollout jsonb`
(`{"stores":[...]}`) · `updated_by` · `updated_at`
> الإنفاذ في الخادم: `assertFeature(key)` يرفض العملية، لا مجرد إخفاء زر (§35).

### `idempotency_keys`
`id` · `scope` text · `key` text · `request_hash` · `status`
(`in_progress`,`completed`) · `response jsonb` · `expires_at`
· **unique `(scope, key)`**

### `rate_limit_counters`
`bucket` text · `window_start` timestamptz · `count int`
· PK `(bucket, window_start)` — حاجز خلفي لما لا تغطيه طبقة الحافة.

### `analytics_daily`
`id` · `store_id` · `date` · `visits` · `unique_visitors` · `orders_count`
· `orders_revenue` · `new_customers` · `products_sold` · `conversion_rate`
· unique `(store_id, date)` — تُملأ بـpg_cron ⇒ لوحة الإحصائيات لا تمسح
جداول الطلبات (§25).

### `system_health_checks`
`id` · `component` (`database, auth, storage, api, jobs, email, domains`) ·
`status` (`healthy, degraded, down`) · `latency_ms` · `detail` · `checked_at`

### `platform_settings`
صف واحد: `maintenance_mode` · `maintenance_message` ·
`default_partner_rate numeric(5,2) default 50` · `default_trial_days` ·
`grace_period_days` · `support_email` · `updated_by` · `updated_at`
> القيم الرقمية هنا **بانتظار Q3/Q4** — لن تُملأ بأرقام مخترعة.

---

## 3.12 الجداول الحالية — مصيرها

| الجدول الحالي | القرار |
|---|---|
| `profiles` | يُبقى، يُعاد تشكيله (إزالة `role` العام لصالح الأدوار السياقية) |
| `stores` | يُبقى ويُوسَّع |
| `products` | يُبقى ويُوسَّع (`images jsonb` → `product_images`) |
| `orders`/`order_items`/`cart_items` | **يُعاد بناؤها** per-store (لا بيانات إنتاج حاليًا — راجع §1.7) |
| `product_reviews` | ⏸️ يُبقى الجدول، الواجهة مطفأة (خارج v1) |
| `favorites` | → `wishlists` بـ`store_id` |
| `subscription_plans`/`seller_subscriptions` | → `plans`/`plan_entitlements`/`subscriptions` |
| `subscription_requests` | يُبقى ويُوسَّع (خصم + مبلغ صافٍ + idempotency) |
| `store_employees` | → `store_members` (بأدوار) |
| `platform_settings` | يُبقى ويُوسَّع |
| `wallet_ledger`, `payout_methods`, `marketer_withdrawal_requests`, `platform_marketers`, `product_marketer_clicks`, أعمدة `marketer_*`/`platform_commission_*` | **بانتظار Q1** — لا يُحذف شيء قبل قرارك |
