# 11. Route Map — خريطة المسارات

## 11.1 الفصل بين التطبيقات

| التطبيق | العنوان | من يدخل |
|---|---|---|
| Platform | `nilemarket.online/*` | الجميع |
| Merchant Dashboard | `nilemarket.online/dashboard/*` | أعضاء المتجر |
| Admin Panel | `nilemarket.online/admin/*` | موظفو المنصة |
| Partner | `nilemarket.online/partner/*` | الشركاء |
| Storefront | `<store>.nilemarket.online/*` أو دومين خاص | زبائن المتجر |

> الفصل **بالـHost** لا بالمسار فقط: مسارات اللوحات مرفوضة (404) على
> دومينات المستأجرين، و`/_sites/*` مرفوض على دومين المنصة.

---

## 11.2 Platform — الموقع الرئيسي

| المسار | المحتوى | التصيير |
|---|---|---|
| `/` | Hero · كيف تعمل · المميزات · الباقات · آراء · FAQ · CTA | Static + ISR 1h |
| `/pricing` | الباقات من `plans`+`plan_entitlements` | ISR 5m |
| `/features` · `/how-it-works` | شرح | Static |
| `/stores` | دليل المتاجر النشطة (اختياري) | ISR 10m |
| `/faq` · `/help` · `/help/[slug]` | مركز المساعدة (§37) | ISR |
| `/contact` | نموذج → تذكرة دعم | Dynamic |
| `/legal/terms` · `/privacy` · `/subscription` · `/cancellation` · `/stores-policy` | القانونية (§38) | Static |
| `/login` · `/signup` · `/verify-email` · `/forgot-password` · `/reset-password` | المصادقة | Dynamic |
| `/auth/callback` · `/auth/confirm` | Google OAuth + تأكيد البريد | Route Handler |
| `/onboarding` · `/onboarding/[step]` | Wizard إنشاء المتجر | Dynamic |
| `/account` · `/account/security` · `/account/sessions` | الحساب + مركز الأمان (§29) | Dynamic |
| `/invite/[token]` | قبول دعوة موظف/شريك | Dynamic |
| `/?ref=<code>` | التقاط الإحالة (كوكي خادمي) | Route Handler |
| `/sitemap.xml` · `/robots.txt` · `/manifest.webmanifest` | SEO + PWA | Route Handler |

### Onboarding Wizard (§7)
`store-info → business-type → logo → whatsapp → delivery → payment →
first-product → preview → publish`
— حفظ تلقائي في `stores(status='draft')` بعد كل خطوة، واستئناف من آخر
خطوة، ومسودة محلية احتياطية ضد انقطاع الشبكة (§21 PWA).

---

## 11.3 Storefront — متجر المستأجر

| المسار | المحتوى | التصيير |
|---|---|---|
| `/` | Header · Banner · تصنيفات · مميزة · أحدث · عروض · Footer | ISR 60s + tag |
| `/products` | كل المنتجات + فلترة وترتيب وpagination | ISR 60s |
| `/products/[slug]` | صفحة المنتج: صور · متغيرات · مخزون · واتساب · مشاركة | ISR 120s |
| `/categories` · `/categories/[slug]` | التصنيفات | ISR 300s |
| `/search?q=` | بحث (GIN عربي) | Dynamic |
| `/offers` | العروض النشطة | ISR 60s |
| `/cart` | السلة (سلة هذا المتجر فقط) | Dynamic |
| `/checkout` | بيانات · منطقة توصيل · كوبون · طريقة دفع | Dynamic |
| `/checkout/success/[orderId]` | نجاح الطلب + رقمه + واتساب | Dynamic |
| `/track` · `/order/[number]` | متابعة الطلب (رقم + هاتف للزائر) | Dynamic |
| `/account` · `/account/orders` · `/account/orders/[id]` · `/account/addresses` | حساب العميل (اختياري) | Dynamic |
| `/wishlist` | المفضلة | Dynamic |
| `/pages/[slug]` | سياسات المتجر (استرجاع · شحن · خصوصية) | ISR |
| `/contact` | تواصل + واتساب | Static |
| `/sitemap.xml` · `/robots.txt` · `/opengraph-image` | SEO لكل متجر | Route Handler |

**حالات المتجر (§18 من الإضافات):** `Store Not Found` · `Store Suspended`
· `Store Closed` · `Domain Pending` · `Domain Misconfigured` · `404` —
كلها صفحات مصمَّمة بالعربية، لا رسائل خام.

**Preview Mode:** `?preview=<token>` يستخدم **نفس محرك المتجر** مع تجاوز
`status` — لا نسخة منفصلة (نص المواصفات).

---

## 11.4 Merchant Dashboard

| المسار | الصلاحية | ملاحظات |
|---|---|---|
| `/dashboard` | أي عضو | ملخص: طلبات جديدة · مبيعات اليوم · تنبيه مخزون · حالة الاشتراك |
| `/dashboard/products` | `products:view` | جدول + بحث + فلترة + إجراءات جماعية |
| `/dashboard/products/new` · `/[id]/edit` | `products:create/update` | حفظ تلقائي للمسودة |
| `/dashboard/products/[id]/variants` | `products:update` | المتغيرات |
| `/dashboard/products/import` · `/export` | `import_export.enabled` | Upload→Validate→Preview→Import |
| `/dashboard/categories` | `categories:manage` | |
| `/dashboard/inventory` | `inventory:view` | كميات · تنبيه نفاد · SKU |
| `/dashboard/inventory/movements` | `inventory:view` | سجل الحركة |
| `/dashboard/orders` | `orders:view` | فلترة بالحالة والتاريخ |
| `/dashboard/orders/[id]` | `orders:view` | تفاصيل · تغيير حالة · دفع · فاتورة · واتساب |
| `/dashboard/customers` · `/[id]` | `customers:view` | سجل العميل وطلباته |
| `/dashboard/coupons` · `/promotions` | `coupons/promotions:manage` | |
| `/dashboard/delivery` | `delivery:manage` | المدن والمناطق والأسعار وCOD |
| `/dashboard/employees` · `/invite` | `members:view/manage` | الأدوار والصلاحيات |
| `/dashboard/whatsapp` | `settings:update` | الرقم · قالب الرسالة · الأزرار |
| `/dashboard/design` | `settings:update` | شعار · بانر · ألوان ثانوية (ضمن Design System) |
| `/dashboard/analytics` | `analytics:view` | من `analytics_daily` |
| `/dashboard/subscription` | `subscription:manage` | الباقة · الاستهلاك · التجديد · الفواتير |
| `/dashboard/domain` | `domain:manage` | إضافة · تعليمات DNS · الحالة · الأساسي |
| `/dashboard/security` | Owner | الجلسات · كلمة المرور · خروج من كل الأجهزة |
| `/dashboard/activity` | `audit:view` | سجل نشاط المتجر |
| `/dashboard/support` · `/[id]` · `/new` | `support:manage` | تذاكر المتجر |
| `/dashboard/settings/*` | `settings:*` | معلومات · تواصل · دفع 🔒 · SEO · إشعارات · سياسات |

**عناصر عامة:** Global Search (منتج/طلب/عميل/SKU) · «مشاهدة المتجر» ·
«مشاركة المتجر» · شريط تنبيه الاشتراك · Bottom Nav على الهاتف.

**حالات كل صفحة إلزامية:** Loading (Skeleton) · Empty (رسالة + إجراء) ·
Error (سبب + إعادة محاولة) · Forbidden (بلا تسريب وجود المورد) ·
Limit Reached (بطاقة ترقية) · Offline (شريط + إعادة محاولة تلقائية).

---

## 11.5 Admin Panel

| المسار | القسم | المستوى الأدنى |
|---|---|---|
| `/admin` | dashboard | view |
| `/admin/merchants` · `/[id]` | merchants | view |
| `/admin/stores` · `/[id]` | stores | view (إيقاف = edit) |
| `/admin/users` · `/[id]` | users | view |
| `/admin/employees` | employees | view |
| `/admin/staff` · `/staff/[id]` | settings | **manage** (موظفو Admin) |
| `/admin/orders` · `/[id]` | orders | view |
| `/admin/products` | products | view |
| `/admin/customers` | customers | view |
| `/admin/plans` · `/[id]` | plans | edit |
| `/admin/subscriptions` · `/requests` | subscriptions | view / **approve** |
| `/admin/payments` · `/[id]` · `/refunds` | payments | view / **approve** |
| `/admin/partners` · `/[id]` · `/new` | partners | view / edit |
| `/admin/commissions` | commissions | view |
| `/admin/payouts` · `/[id]` | payouts | view / **approve** |
| `/admin/domains` | domains | view / edit |
| `/admin/notifications` · `/send` | notifications | create |
| `/admin/support` · `/[id]` | support | view / manage |
| `/admin/reports/*` | reports | view |
| `/admin/security` | security | view |
| `/admin/audit-logs` | audit_logs | view (**لا حذف لأحد**) |
| `/admin/feature-flags` | feature_flags | manage |
| `/admin/system-health` | system_health | view |
| `/admin/maintenance` | maintenance | manage |
| `/admin/content/*` | content | edit |
| `/admin/settings` | settings | manage |

**الإنفاذ:** كل قسم يتحقق في الـ`layout` **وفي كل Server Action**. الوصول
المباشر إلى مسار غير مصرّح ⇒ 404 (لا 403 يكشف وجود القسم).

---

## 11.6 Partner Dashboard

`/partner` (ملخص) · `/partner/merchants` · `/partner/commissions` ·
`/partner/payouts` · `/partner/payouts/request` · `/partner/link` ·
`/partner/support` · `/partner/settings`

---

## 11.7 API Routes

```
/api/v1/webhooks/[provider]     POST   تحقق توقيع + Idempotency
/api/v1/cron/[job]              GET    محمي بـCRON_SECRET
/api/v1/uploads/sign            POST   توقيع رفع بعد التحقق من الحدود
/api/v1/uploads/complete        POST   تسجيل media_files + طابور المعالجة
/api/v1/export/[resource]       POST   يُنشئ Job ويُرجع jobId
/api/v1/track/[event]           POST   زيارات المتجر (محدود المعدل)
/api/v1/health                  GET    فحص صحة
/api/v1/domains/verify          POST   تشغيل تحقق يدوي (محدود المعدل)
```
