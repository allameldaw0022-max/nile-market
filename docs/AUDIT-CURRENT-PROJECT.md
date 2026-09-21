# 1. Current Project Audit — فحص المشروع الحالي

> فحص أُجري على الفرع `main` عند الـcommit `fcc8fd6`، بالإضافة إلى مشروع
> Supabase المرتبط بالحساب. الهدف: تحديد ما يُعاد استخدامه، ما يُعاد
> بناؤه، والمشاكل المعمارية والأمنية قبل بدء التنفيذ.

---

## 1.1 الوضع التقني الحالي

| العنصر | القيمة الفعلية | ملاحظة |
|---|---|---|
| Framework | **Next.js 16.3.3** (App Router) | إصدار حديث؛ يستخدم `proxy.ts` بدل `middleware.ts`، وأنواع `PageProps<>` / `LayoutProps<>` المولّدة. **إلزامي قراءة `node_modules/next/dist/docs/` قبل كتابة أي كود في المرحلة 2** (تعليمات `AGENTS.md`). |
| React | **19.2.8** | Server Components افتراضيًا. |
| TypeScript | 5.x، `strict: true` | جيد، يُبقى. |
| Styling | **Tailwind CSS v4** (`@theme inline` في `globals.css`) | لا ملف `tailwind.config`; التوكنز في CSS. |
| Data layer | `@supabase/ssr` 0.12 + `supabase-js` 2.112 | النمط الصحيح (server client عبر cookies). |
| Icons | `lucide-react` | يُبقى. |
| Node | غير مثبّت في `engines` | يُضاف `"engines": { "node": ">=20" }`. |
| Tests | **لا يوجد أي اختبار ولا CI** | فجوة كاملة. |
| `node_modules` | غير مثبّت في بيئة العمل الحالية | أول خطوة في المرحلة 2: `npm install`. |

### حجم الكود الحالي
- **78 ملف** داخل `src/` (صفحات + مكوّنات + استعلامات).
- **21 migration** (~1,973 سطر SQL) داخل `supabase/migrations/`.

---

## 1.2 قاعدة البيانات الحالية — ملخّص

### الجداول الموجودة (16)
`profiles`, `stores`, `products`, `product_reviews`, `cart_items`,
`favorites`, `orders`, `order_items`, `notifications`,
`subscription_plans`, `seller_subscriptions`, `subscription_requests`,
`marketer_withdrawal_requests`, `platform_marketers`, `store_employees`,
`product_marketer_clicks`, `platform_settings`, `wallet_ledger`,
`payout_methods`, وجداول السحب الموحّد (0018).

### الجداول المطلوبة في المواصفات وغير الموجودة نهائيًا
`store_settings`, `store_domains`, `categories`, `product_variants`,
`inventory`, `inventory_movements`, `customers` (سجل عميل على مستوى
المتجر), `addresses`, `payments`, `payment_events`, `refunds`,
`invoices`, `coupons`, `coupon_redemptions`, `promotions`,
`delivery_zones`, `plan_entitlements`, `subscription_events`,
`partners`, `referrals`, `commission_ledger`, `partner_payouts`,
`support_tickets`, `support_messages`, `support_internal_notes`,
`audit_logs`, `media_files`, `feature_flags`, `admin_members`,
`admin_role_permissions`, `idempotency_keys`, `job_queue`,
`email_outbox`, `analytics_daily`, `system_health_checks`,
`store_order_sequences`, `order_status_history`.

> أي: **البنية الحالية تغطي ~30% من نموذج البيانات المطلوب**.

---

## 1.3 ⚠️ أهم اكتشاف معماري: المشروع الحالي **Marketplace** والمواصفات **SaaS متعدد المستأجرين**

هذا أخطر فرق، وهو يغيّر جذور نموذج البيانات:

| البُعد | المبني حاليًا | ما تطلبه المواصفات |
|---|---|---|
| نموذج العمل | سوق مركزي واحد (`nilemarket.online/store/[slug]`) بسلة عامة وHeader/Footer موحّد فوق كل المتاجر | كل تاجر **موقع مستقل** على `store.nilemarket.online` أو دومين خاص؛ «المتجر يجب أن يبدو كموقع مستقل، وليس كصفحة داخل لوحة الإدارة» (§9) |
| السلة | سلة **واحدة عابرة للمتاجر** (`cart_items` مربوطة بالعميل فقط) | سلة **لكل متجر** — لا يوجد شراء من متجرين في طلب واحد |
| الطلب | `orders` بدون `store_id`؛ طلب واحد قد يضم عدة متاجر عبر `order_items.store_id` | الطلب ملك متجر واحد، له رقم فريد وحالة واحدة (§13) |
| حالة الطلب | على مستوى **`order_items`** | على مستوى **الطلب** |
| Checkout كزائر | ممنوع (`checkout_cart` يرفض غير المسجّل) | **مطلوب** Guest Checkout (§8) |
| مصدر إيراد المنصة | **عمولة على كل طلب** (`platform_commission_rate`) | **الاشتراكات فقط**؛ لا ذكر لأي عمولة على مبيعات التاجر |
| «المسوّق» | نظام أفلييت للمنتجات داخل المتاجر (روابط، نقرات، عمولة على الطلب، محفظة، سحب) + برنامج «الـ50 مسوّقًا» | **غير موجود في المواصفات إطلاقًا.** نظام الإحالة في المواصفات هو **Partners يحيلون تجّارًا** ويأخذون 50% من مدفوعات الاشتراك |
| العميل | `profiles` عام على مستوى المنصة | عميل **تابع للمتجر** (`customers` بـ`store_id`) |

**القرار المطلوب منك:** مصير نظام المسوّقين/العمولة على الطلبات
(`marketer_*`, `platform_commission`, `wallet_ledger`, `payout_methods`,
`product_marketer_clicks`, `platform_marketers`) — راجع
`OPEN-QUESTIONS.md` سؤال **Q1**. لن يُحذف أي شيء قبل قرارك.

---

## 1.4 المشاكل الأمنية والمعمارية المكتشفة

مرتّبة حسب الخطورة.

### 🔴 S1 — سياسة RLS ارتدادية (Infinite Recursion) على `profiles`
`0001_core_schema.sql`:
```sql
create policy "profiles: admin read all" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
```
سياسة على `profiles` تستعلم من `profiles` نفسه ⇒ Postgres يُطلق
`42P17: infinite recursion detected in policy for relation "profiles"`.
تُقيَّم كل السياسات بالـOR، فالسياسة الارتدادية تنفجر حتى لو كان
`auth.uid() = id` كافيًا. نفس النمط في `protect_profile_role()`
و`find_profile_id_by_email`-adjacent paths.

**دليل ميداني:** الـcommit `688d88b` («تسجيل تشخيصي عند فشل قراءة بروفايل
مستخدم مسجّل دخوله») أُضيف تحديدًا لملاحقة هذا العَرَض.

**التبعة الثانية (fail-open منطقي):** في `src/lib/supabase/queries.ts`
```ts
role: profile?.role ?? "customer"
```
فشل القراءة لا يُميَّز عن «لا يوجد سجل»، فيُصنَّف المستخدم `customer`
بصمت ⇒ Admin حقيقي يُطرد إلى `/account` بلا سبب مفهوم.

**الحل المعتمد:** دوال `SECURITY DEFINER` في سكيمة `app` خاصة
(`app.current_role()`, `app.is_platform_staff(...)`) — تفاصيل في
[`RLS.md`](./RLS.md). ويجب أن يُميَّز خطأ القراءة عن غيابها ويفشل مغلقًا.

### 🔴 S2 — رسوم التوصيل تُحسب من المتصفح
`0004_checkout_function.sql`:
```sql
create function public.checkout_cart(p_delivery_address jsonb, p_delivery_fee numeric default 0)
... values (..., p_delivery_fee, v_subtotal, 0, v_subtotal + p_delivery_fee)
```
`p_delivery_fee` يأتي من العميل ⇒ يمكن لأي عميل إرسال `0` والشراء بلا
توصيل. يخالف المواصفات §14 صراحة («لا تثق بقيمة المبلغ القادمة من
المتصفح»). الخصم مثبّت على `0` ولا يوجد كوبونات أصلًا.

**الحل:** `delivery_zones` على مستوى المتجر، والسعر يُشتق **داخل** الدالة
من منطقة العنوان، لا من الوسيط.

### 🟠 S3 — الموظفون بلا أدوار: كل موظف = صلاحيات كاملة
`0014_store_employees.sql` يعطي أي صف في `store_employees` سياسة
`for all` على `products` و`order_items`. لا يوجد عمود `role` ولا
`permissions`. المواصفات §18 تطلب `Owner / Manager / Orders / Products /
Customer Service` وصلاحيات قابلة للتوسع.
⇒ موظف «خدمة عملاء» يستطيع اليوم حذف منتجات المتجر.

### 🟠 S4 — Admin حساب خارق أحادي
`user_role = 'admin'` فقط. لا يوجد موظفو Admin ولا صلاحيات حسب الأقسام،
بينما المواصفات تُفرد قسمًا كاملًا لذلك («موظفو لوحة Admin والصلاحيات حسب
الأقسام» + §24 Data Access Matrix: موظف الدعم لا يرى البيانات المالية).

### 🟠 S5 — `find_profile_id_by_email` = أوراكل لتعداد البُرد الإلكترونية
`SECURITY DEFINER` على `auth.users`، مُتاحة لأي مستخدم `authenticated`،
بلا أي Rate Limiting ⇒ يمكن التحقق من وجود أي بريد في المنصة.
**الحل:** استبدالها بتدفق دعوة بـToken (`store_invitations`) لا يكشف
وجود الحساب من عدمه.

### 🟡 S6 — إدراج مجهول غير محدود في `product_marketer_clicks`
`create policy "clicks: anyone insert" ... with check (true)` ⇒ أي زائر
يستطيع حقن ملايين الصفوف. لا Rate Limiting ولا تنظيف.

### 🟡 S7 — أداء RLS: `auth.uid()` غير ملفوف
كل السياسات تستخدم `auth.uid()` مباشرة ⇒ يُعاد تقييمها لكل صف. المعيار
المعتمد في Supabase هو `(select auth.uid())` ليُقيَّم مرة واحدة
(InitPlan). يجب تعميمه على كل السياسات الجديدة.

### 🟡 S8 — `next.config.ts` يثبّت مشروع Supabase قديمًا
```ts
hostname: "qkinvnwtsaaemdygapvn.supabase.co"
```
مشروع Supabase الموجود في حسابك الآن هو **`pxnaraiqqgmhnidbouyk`**
(`nile-market`, eu-west-1, أُنشئ حديثًا، **صفر جداول وصفر migrations**).
⇒ كل صور المنتجات ستنكسر. يجب اشتقاق الـhostname من
`NEXT_PUBLIC_SUPABASE_URL` بدل تثبيته.

### 🟡 S9 — قيد فريد غير مبرر على اسم المتجر
`create unique index stores_name_unique on public.stores (lower(name));`
المواصفات تطلب **Slug** فريدًا فقط. منع تاجرين من تسمية متجريهما
«الأمانة» قيد تجاري لم يطلبه أحد.

### 🟡 S10 — لا توجد Storage buckets ولا سياسات تخزين
`products.images jsonb` يخزن روابط، لكن لا يوجد أي bucket معرّف في
الـmigrations، ولا سياسات، ولا جدول `media_files`، ولا تحقق MIME/حجم.

### 🟡 S11 — لا `audit_logs` رغم أن المواصفات تفرده بقسم كامل (§30)

### 🟡 S12 — لا فصل بين Order وPayment
لا يوجد جدول `payments` إطلاقًا. المواصفات §13/§14 تفرض الفصل، وحالات
`Pending/Paid/Failed/Refunded`، وIdempotency على الدفعات.

---

## 1.5 ما **يُعاد استخدامه** (Reuse)

| الأصل | الحكم |
|---|---|
| إعداد Next 16 + TS + Tailwind v4 + `proxy.ts` | ✅ يُبقى كما هو |
| `src/lib/supabase/{server,client,middleware}.ts` | ✅ صحيح معماريًا — يُبقى ويُضاف إليه عميل خدمي معزول |
| `getCurrentUser()` مع `cache()` | ✅ الفكرة صحيحة — يُصلَّح سلوك الخطأ فقط |
| Security headers في `next.config.ts` | ✅ يُبقى + يُضاف CSP |
| هوية الخط (Cairo) و`dir="rtl"` و`lang="ar"` | ✅ يُبقى |
| نمط الـmigrations المرقّمة مع تعليقات تفسيرية | ✅ ممتاز — يُكمَل عليه |
| `handle_new_user()` trigger | ⚠️ يُبقى المبدأ، يُعاد كتابته (الدور من `raw_user_meta_data` غير موثوق للأدوار الحساسة) |
| `protect_*` triggers (حماية أعمدة حساسة) | ✅ نمط جيد جدًا — يُعمَّم على العمولات والأسعار |
| `approve_subscription_request()` (ذرّية الموافقة) | ✅ النمط صحيح — يُعاد بناؤه فوق Payments/Ledger |
| Ledger كـ«مصدر حقيقة مالي بصفوف قيد» (0018) | ✅ **فكرة ممتازة** — تُعاد صياغتها كـ`ledger_entries` عام للاشتراكات والعمولات |
| صفحات `/terms`, `/privacy`, Footer | ✅ يُبقى محتواها ويُوسَّع |
| `product_reviews` | ⏸️ تُبقى الجداول (لا تُحذف بيانات)، ولا تُعرض في v1 (خارج نطاق الإصدار الأول §27) |

## 1.6 ما **يُعاد بناؤه** (Rebuild)

| المجال | السبب |
|---|---|
| `orders` / `order_items` / `cart` | تحويل من Marketplace إلى Per-Store + Guest Checkout + حالة على مستوى الطلب |
| كل سياسات RLS | نمط ارتدادي + بلا أدوار موظفين + بلا Admin مُجزّأ + أداء |
| الصلاحيات (Store + Admin) | غير موجودة أصلًا بالشكل المطلوب |
| الاشتراكات | من «خطة + طلب» إلى Entitlements Engine كامل بحدود قابلة للتطبيق |
| Storefront | من صفحة داخل المنصة إلى تطبيق مستأجر مستقل بـHostname Routing |
| Admin Panel | من 12 صفحة أحادية الصلاحية إلى 23 قسمًا بصلاحيات مُجزّأة |
| Design System | التوكنز الحالية (`#1e4fa3`, `#d4af37`) **لا تطابق** ألوان المواصفات (`#0B5ED7`, `#D9A441`) |

## 1.7 حالة البيئة الخارجية

| العنصر | الحالة |
|---|---|
| Supabase project | `pxnaraiqqgmhnidbouyk` — `ACTIVE_HEALTHY`, Postgres 17.6, eu-west-1، **فارغ تمامًا** |
| Migrations المطبّقة عليه | **صفر** |
| Vercel | المستودع مربوط بالنشر من `main` (حسب README) |
| أسرار داخل المستودع | ✅ لا يوجد — `.env.example` يوثّق الأسماء فقط، و`SUPABASE_SERVICE_ROLE_KEY` غير مستخدم في `src/` إطلاقًا |

**معنى ذلك:** لدينا فرصة نادرة — القاعدة الجديدة فارغة، فيمكن بناء المخطط
الصحيح من البداية **دون migration مؤلمة لبيانات إنتاج**. هذا يجب أن
يُستغل الآن قبل دخول أي بيانات حقيقية.
