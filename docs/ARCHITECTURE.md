# 2. Architecture — المعمارية العامة

## 2.1 المبدأ الحاكم

**مشروع Next.js واحد + مشروع Supabase واحد + قاعدة بيانات واحدة**، يخدم
أربعة تطبيقات منطقية تتحدد بالـ**Hostname** وبمجموعة المسارات.

سبب الوحدة (وليس مشاريع منفصلة):
- الدومينات المخصصة تتطلب طبقة توجيه واحدة؛ **ممنوع مشروع استضافة لكل
  متجر** (نص المواصفات صراحة).
- مشاركة الأنواع وDesign System وطبقة الصلاحيات دون نسخ.
- نشر ذرّي واحد: لا انحراف إصدارات بين المتجر واللوحة.

```
                         ┌────────────── الإنترنت ──────────────┐
                         │                                      │
   www.nilemarket.online │   store.nilemarket.online   متجر.com │
            │            │              │                │      │
            └────────────┴──────────────┴────────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │  Vercel Edge · proxy.ts  │  ← Tenant Resolution
                    │  Host → storeId (cached) │     + Security Headers
                    └────────────┬─────────────┘
                                 │  rewrite
        ┌────────────┬───────────┼───────────┬──────────────┐
        ▼            ▼           ▼           ▼              ▼
   (platform)   (dashboard)   (admin)    (partner)   (storefront)
   موقع المنصة   لوحة التاجر   لوحة Admin  لوحة الشريك   متجر المستأجر
        │            │           │           │              │
        └────────────┴─────┬─────┴───────────┴──────────────┘
                           │
              ┌────────────▼─────────────┐
              │   Server Layer (Node)    │
              │  Server Actions · /api   │
              │  authorize() · validate()│
              │  rate-limit · audit      │
              └────────────┬─────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  Supabase Auth      PostgreSQL 17       Supabase Storage
   (identity)      RLS · RPC · Triggers   4 buckets + policies
                   pg_cron · pg_net
                           │
                     Edge Functions
                    (email · jobs · webhooks)
```

---

## 2.2 التطبيقات الأربعة وحدودها

| # | التطبيق | الـHost | جذر المسار | من يدخله |
|---|---|---|---|---|
| 1 | **Platform** — الموقع الرئيسي | `nilemarket.online` | `/` | الجميع |
| 2 | **Merchant Dashboard** | `nilemarket.online` | `/dashboard` | مالك المتجر + موظفوه |
| 3 | **Admin Panel** | `nilemarket.online` | `/admin` | موظفو المنصة فقط |
| 4 | **Partner Dashboard** | `nilemarket.online` | `/partner` | الشركاء |
| 5 | **Storefront** — متجر المستأجر | `*.nilemarket.online` أو دومين خاص | `/` | زبائن المتجر (وزوّار مجهولون) |

### هيكل المجلدات

```
src/
├── proxy.ts                       # Tenant resolution + headers (Next 16)
├── app/
│   ├── (platform)/                # nilemarket.online
│   │   ├── page.tsx               # Hero · مميزات · باقات · FAQ
│   │   ├── pricing/  faq/  help/  contact/
│   │   ├── legal/{terms,privacy,subscription,cancellation,stores}/
│   │   ├── (auth)/{login,signup,verify,forgot,reset}/
│   │   └── onboarding/            # Wizard إنشاء المتجر
│   ├── (dashboard)/dashboard/     # لوحة التاجر — راجع ROUTES.md
│   ├── (admin)/admin/             # لوحة Admin
│   ├── (partner)/partner/         # لوحة الشريك
│   ├── (storefront)/_sites/[host]/  # ← يُوصل إليه بالـrewrite فقط
│   └── api/v1/                    # نقاط REST (webhooks · cron · uploads)
├── components/
│   ├── ui/                        # Design System الأساسي
│   ├── storefront/  dashboard/  admin/  platform/
├── lib/
│   ├── supabase/{server,client,service,middleware}.ts
│   ├── auth/         # getSession · getCurrentActor
│   ├── authz/        # ★ requireStoreAccess · requirePlatformAccess
│   ├── tenant/       # resolveHost · getStoreContext (cached)
│   ├── entitlements/ # ★ assertWithinLimit · hasFeature
│   ├── money/        # حساب المبالغ — Server فقط
│   ├── validation/   # مخططات zod مشتركة
│   ├── jobs/         # منتِج المهام الخلفية
│   └── email/        # EmailProvider abstraction
└── types/
```

---

## 2.3 Tenant Resolution — أخطر جزء في النظام

### التدفق
```
طلب وارد
  └─ proxy.ts يقرأ Host
       ├─ host ∈ {nilemarket.online, www, *.vercel.app} → منصة: pass-through
       │     └─ إن بدأ المسار بـ/_sites → 404 فورًا (منع التجاوز)
       └─ غير ذلك → rewrite إلى /_sites/<host><pathname>
             └─ layout المستأجر: getStoreContext(host)
                  ├─ استعلام واحد: store_domains ⋈ stores  (أو slug للنطاق الفرعي)
                  ├─ لا نتيجة        → صفحة Store Not Found
                  ├─ status=suspended → صفحة Store Suspended
                  ├─ اشتراك منتهٍ     → وضع «للعرض فقط» (حسب Q2)
                  └─ نجاح            → StoreContext { storeId, ... } مُمرَّر عبر cache()
```

### القواعد الأمنية غير القابلة للتفاوض
1. `storeId` **لا يأتي أبدًا** من query أو body أو header في مسارات
   الـStorefront — يُشتق من الـHost حصريًا. هذا هو جدار منع IDOR الأول.
2. كل استعلام داخل الـStorefront يمرّر `store_id` من `StoreContext`،
   وRLS تتحقق منه مرة ثانية.
3. `_sites/*` غير قابل للوصول المباشر من دومين المنصة.
4. النتيجة مخزّنة بـ`unstable_cache` بوسم `tenant:<host>` ومدة 60 ثانية؛
   يُبطَل الوسم فورًا عند تغيير الدومين أو الحالة.

---

## 2.4 حدود Server / Client

| يُنفَّذ **حصريًا** على الخادم | يُسمح به على العميل |
|---|---|
| كل حساب مالي (المجموع، التوصيل، الخصم، العمولة) | عرض أرقام **مُرجَعة** من الخادم |
| التحقق من الصلاحيات والأدوار | إخفاء/إظهار عناصر واجهة (تحسين تجربة فقط) |
| التحقق من حدود الباقة | تحذير استباقي «اقتربت من الحد» |
| انتقالات حالة الطلب والدفع | أزرار تستدعي Server Action |
| كتابة Audit Log | — |
| Service Role Key | ❌ ممنوع منعًا باتًا |
| رفع الملفات (توقيع المسار + التحقق) | اختيار الملف وضغط الصورة قبل الرفع |

**آلية الإنفاذ:** كل ملف تحت `lib/authz`, `lib/money`, `lib/supabase/service.ts`
يبدأ بـ`import "server-only"` ⇒ أي استيراد من مكوّن عميل يفشل **وقت
البناء**، لا وقت التشغيل.

---

## 2.5 متى نستخدم ماذا؟

| الآلية | الاستخدام | أمثلة |
|---|---|---|
| **Server Component** | كل قراءة لعرض صفحة | قوائم المنتجات، الطلبات، التقارير |
| **Server Action** | كل كتابة يبدأها المستخدم من الواجهة | إضافة منتج، تغيير حالة طلب، إنشاء كوبون |
| **Route Handler `/api/v1/*`** | ما لا يصلح كـServer Action | Webhooks، Cron، رفع ملفات متعدد الأجزاء، تصدير CSV، robots/sitemap |
| **Postgres RPC (`security definer`)** | عملية **ذرّية متعددة الجداول** أو مالية | `create_order`, `record_payment`, `approve_refund`, `post_commission`, `transition_order` |
| **Database Trigger** | ثابت لا يجوز خرقه مهما كان المستدعي | منع تعديل Ledger، حماية أعمدة العمولة، ختم `updated_at`، رفض انتقال حالة غير شرعي |
| **Edge Function** | عمل خارج دورة الطلب | إرسال البريد، معالجة الصور، تشغيل صف المهام |
| **pg_cron** | جدولة | كنس الاشتراكات، تجميع التحليلات، تنظيف الـidempotency |

**قاعدة الذهب:** إن كانت العملية تلمس المال أو تغيّر حالة أو تعبر أكثر من
جدول ⇒ **RPC داخل معاملة واحدة**، وليس عدة استدعاءات متتابعة من Next.js.

---

## 2.6 طبقة السلطة (Authorization Layer)

ثلاثة جدران متتالية، وكل جدار يكفي وحده لو سقط غيره:

```
1) Route Guard      (layout/page) — هل يُسمح لهذا الفاعل برؤية هذا القسم؟
2) Action Guard     requireStoreAccess(storeId, 'orders:update')
                    requirePlatformAccess('payments', 'approve')
                    ↑ هنا يُرفض الطلب فعليًا — هذا هو الجدار الحقيقي
3) RLS / RPC        القاعدة ترفض الصف حتى لو أخطأ الجداران الأولان
```

`getCurrentActor()` تُرجع كائنًا موحّدًا:
```ts
type Actor =
  | { kind: 'anonymous' }
  | { kind: 'customer';  userId: string }
  | { kind: 'store';     userId: string; storeId: string;
      role: StoreRole; permissions: Set<StorePermission> }
  | { kind: 'platform';  userId: string;
      permissions: Map<AdminSection, AdminLevel> }
  | { kind: 'partner';   userId: string; partnerId: string };
```
> **فشل مغلق:** أي خطأ في تحميل الفاعل ⇒ يُعامَل كـ`anonymous`
> ويُسجَّل الخطأ — لا يُخمَّن دور افتراضي (إصلاح مباشر لثغرة S1 في
> `AUDIT-CURRENT-PROJECT.md`).

---

## 2.7 المهام الخلفية (Background Jobs)

جدول `job_queue` + مُشغِّلان يعملان على Free Tier:

| المُشغِّل | الدورية | المهام |
|---|---|---|
| **pg_cron** (داخل Postgres) | كل 5 دقائق | كنس الاشتراكات (Expiring→Grace→Expired)، تنظيف `idempotency_keys`، تجميع `analytics_daily` |
| **pg_cron + pg_net** → Edge Function | كل دقيقة | تصريف `email_outbox`، معالجة `job_queue` (صور، استيراد، تقارير) |
| **Vercel Cron** | احتياطي يومي | فحص صحة، تقرير يومي |

> لماذا pg_cron وليس Vercel Cron كأساس؟ لأن **Vercel Hobby يحدّ الـcron
> بتشغيل يومي واحد**، بينما pg_cron متاح على Supabase Free بدورية دقائق.
> الطبقة مجرّدة ⇒ الانتقال إلى QStash/Inngest لاحقًا لا يمسّ منطق المهام.

المهام التي **يمنع** تنفيذها داخل الطلب: إرسال البريد، معالجة/ضغط الصور
بعد الرفع، استيراد CSV، توليد التقارير والتصدير، كنس الاشتراكات، تجميع
التحليلات، إشعارات جماعية، التحقق من DNS للدومينات.

---

## 2.8 ترابط الأنظمة (من يستدعي من)

```
Order ──creates──▶ Payment ──▶ ledger_entries (لا شيء يُحذف)
  │                   │
  │                   └──refund──▶ refunds ──▶ قيود عكسية
  ├──▶ inventory_movements (خصم عند التأكيد، إرجاع عند الإلغاء)
  ├──▶ notifications (تاجر + عميل)
  └──▶ audit_logs

Subscription ──payment──▶ ledger_entries
       │                      │
       │                      └─▶ commission_ledger (إن للمتجر شريك)
       │                                │
       │                                └─▶ partner_payouts
       └──▶ entitlements (يُحدَّث فورًا في كل نقاط النظام)

Store ──▶ store_domains ──▶ Tenant Resolution ──▶ Storefront
  └──▶ store_members (الصلاحيات) ──▶ كل عملية في اللوحة

SupportTicket ──▶ يمكن ربطه بـ(store · order · payment · subscription)
                   دون كشف بيانات خارج صلاحية موظف الدعم
```

---

## 2.9 قرارات معمارية مثبّتة (ADR مختصر)

| # | القرار | البديل المرفوض | السبب |
|---|---|---|---|
| 1 | مشروع Next واحد بـHost routing | مشروع/نشر لكل متجر | نص المواصفات + تكلفة + استحالة الصيانة |
| 2 | `stores` هو المستأجر، و`store_id` على كل جدول مستأجَر | سكيمة لكل متجر | سكيمة لكل متجر تنفجر بعد عشرات المتاجر على Free Tier |
| 3 | العمليات المالية في RPC داخل معاملة | منطق في TypeScript | الذرّية والحماية من أي مستدعٍ |
| 4 | Ledger إلحاقي فقط (Append-only) | تعديل الأرصدة مباشرة | قابلية التدقيق + عدم حذف التاريخ المالي |
| 5 | صلاحيات مادّية في القاعدة (`store_members.permissions`) وليست في التوكن | حقن الأدوار في JWT | إلغاء الصلاحية يسري **فورًا** بلا انتظار انتهاء التوكن |
| 6 | `numeric(14,2)` للأموال | `float` / `bigint` بالقروش | دقة عشرية مضمونة بلا تعقيد تحويل |
| 7 | الحالة على مستوى **الطلب** لا السطر | حالة لكل عنصر (النموذج الحالي) | المواصفات §13 + وضوح تجربة الزبون |
| 8 | تصميم متجر موحّد بتخصيص محدود | ثيمات حرّة | المواصفات §9 + أداء + قابلية صيانة |
