# 16. Security Threat Model

> لكل خطر: الناقل، والأثر، والحاجز المعتمد، وكيف يُختبر.

## 16.1 Authentication

| الخطر | الحاجز |
|---|---|
| ضعف كلمة المرور | حد أدنى 8 + فحص كلمات شائعة، وقوة معروضة للمستخدم |
| Brute Force | 5 محاولات/15د لكل (بريد+IP) + تأخير تصاعدي + تنبيه للمالك |
| تعداد الحسابات | رسالة واحدة موحّدة للدخول والاستعادة؛ حذف `find_profile_id_by_email` (S5) |
| سرقة جلسة | كوكي `HttpOnly · Secure · SameSite=Lax` + دوران توكن + HSTS |
| جلسات قديمة | مركز الأمان: عرض الأجهزة + إلغاء جلسة + «خروج من كل الأجهزة» |
| حساب Admin مخترق | 2FA لحسابات Admin (**Q14**) + تسجيل كل إجراء + إيقاف فوري |
| OAuth مزوّر | `redirectTo` من قائمة بيضاء فقط + PKCE |
| بريد غير مؤكد | عمليات حساسة تتطلب `email_verified_at` |

## 16.2 Authorization / IDOR

| الخطر | الحاجز |
|---|---|
| تغيير ID في URL للوصول لمورد غيره | `storeId` من الـHost في المتجر؛ ومن `requireStoreAccess` في اللوحة؛ وRLS جدار ثانٍ |
| تخطي طبقة الواجهة بنداء PostgREST مباشر | RLS على كل جدول + لا سياسة لـ`anon` على الخاص |
| مسار Admin بلا صلاحية | فحص في الـlayout **وفي كل Action**؛ رد 404 لا 403 |
| Broken Access Control في Server Action | `require*Access` إلزامي + قاعدة ESLint + مراجعة |
| تسريب وجود المورد | `FORBIDDEN` على مورد غير مملوك يُعاد `NOT_FOUND` |
| تحويل صف بين متجرين | `with check` على UPDATE + trigger عدم قابلية تغيير `store_id` |

## 16.3 Tenant Isolation

| الخطر | الحاجز |
|---|---|
| Host مزوّر | البحث في `store_domains` فقط؛ لا نتيجة ⇒ 404 |
| وصول مباشر إلى `/_sites/*` | مرفوض من دومين المنصة |
| تسمّم الـcache بين مستأجرين | مفتاح الـcache يتضمن الـhost + وسم `tenant:<host>` |
| متجر موقوف يظل حيًا في الـcache | إبطال فوري بالوسم عند تغيير الحالة |
| استعلام نسي `store_id` | RLS ترفضه حتى لو نسيه المطوّر + اختبار عزل لكل جدول |

## 16.4 Injection

| الخطر | الحاجز |
|---|---|
| SQL Injection | معاملات مربوطة دائمًا (supabase-js/PostgREST)؛ ممنوع بناء SQL بالسلاسل؛ كل دالة `set search_path` صريح |
| XSS مخزَّن | تنقية عند التخزين + عند العرض؛ ممنوع `dangerouslySetInnerHTML` إلا على محتوى منقّى؛ **رفض SVG** في الرفع |
| XSS منعكس | React يهرّب افتراضيًا + CSP |
| حقن في العناوين | تنقية `Host`/`Referer` قبل أي استخدام |
| حقن CSV (Formula Injection) | تصدير: تصدير أي خلية تبدأ بـ`= + - @` بمسبوق `'` |
| حقن قوالب البريد | ترميز كل المتغيرات |

**CSP المعتمد:**
```
default-src 'self';
script-src 'self' 'nonce-<random>';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://<project>.supabase.co;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' https://<project>.supabase.co;
frame-ancestors 'none'; base-uri 'self'; form-action 'self';
object-src 'none'; upgrade-insecure-requests
```
مع الرؤوس القائمة: `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Permissions-Policy`, `HSTS`.

## 16.5 CSRF
Server Actions في Next 16 تتحقق من المصدر تلقائيًا · كوكي `SameSite=Lax`
· Route Handlers الحساسة تتحقق من `Origin` صراحة · لا عمليات تغيير حالة
عبر `GET` إطلاقًا.

## 16.6 Privilege Escalation
راجع [`RLS.md §4.6`](./RLS.md) — أبرزها: لا عمود `role` في `profiles`؛
`handle_new_user()` **لا يقرأ أي دور من بيانات التسجيل**؛ لا عضو يرفع
نفسه أو يمنح دورًا أعلى من دوره؛ نسب العمولات ومبالغ الدفع محمية
بـtriggers.

## 16.7 المال

| الخطر | الحاجز |
|---|---|
| تلاعب بالسعر | السعر يُقرأ من `products` داخل `create_order` |
| تلاعب برسوم التوصيل | من `delivery_zones` خادميًا (إصلاح S2) |
| إساءة استخدام الكوبونات | التحقق في القاعدة · `unique(order_id)` على الاستخدام · حد لكل عميل يُحسب من الجدول · سقف الخصم |
| خصم يجعل المجموع سالبًا | `check (total >= 0)` + قص الخصم عند `subtotal` |
| طلبات مكررة | `unique(store_id, idempotency_key)` |
| دفعة مكررة | `unique(kind, idempotency_key)` + `external_event_id` |
| عمولة مكررة | `unique(payment_id) where entry_kind='commission'` |
| صرف مزدوج | ربط صفوف العمولة بـ`payout_id` داخل معاملة واحدة |
| تعديل سجل مالي | جداول إلحاقية + `REVOKE` + triggers |
| Replay | طوابع + `external_event_id` + `idempotency_keys` |
| تجاوز حد الباقة بالتزامن | الفحص والإدراج في معاملة واحدة مع `FOR UPDATE` |

## 16.8 الملفات
قائمة MIME بيضاء · فحص Magic Bytes · حد الحجم والأبعاد · أسماء UUID ·
**رفض SVG** · `Content-Disposition: attachment` لغير الصور · Signed URL
قصير للخاص · حصة تخزين لكل متجر · حجر الملف المشبوه.

## 16.9 الدومينات
تحقق TXT بتوكن عشوائي لكل دومين · `unique(hostname)` عالمي ·
إعادة تحقق كاملة عند إعادة الربط · فحص دوري للدومينات النشطة ·
سحب الدومين عند حذف/إيقاف المتجر.

## 16.10 API Abuse
Rate Limiting متدرّج (§12.6) · Pagination إجباري بسقف 100 · تعطيل
`select=*` من العميل باختيار أعمدة صريح · تسجيل الأنماط الشاذة ·
`maintenance_mode` كمفتاح إيقاف طارئ.

## 16.11 كشف البيانات الحساسة

| البيان | الحماية |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `server-only` + فحص CI يمنع استيراده من `app/**` |
| بيانات بنوك المتجر | صلاحية `settings:banking` فقط + كل وصول مُدقَّق |
| هاتف/بريد العميل | مقنّع إلا بصلاحية `customers:edit` |
| إثباتات التحويل | Signed URL 5 دقائق فقط |
| `cost_price` | لا يخرج إلى الـStorefront إطلاقًا |
| ملاحظات الدعم الداخلية | جدول منفصل بلا سياسة للمستخدم |
| رسائل الخطأ | لا SQL ولا أسماء جداول ولا stack |
| السجلات | تنقية: لا كلمات مرور ولا توكنات ولا أرقام هواتف كاملة |
| IP | يُخزَّن **مجزّأً** (`ip_hash`) لا خامًا |

## 16.12 مراقبة العمليات المشبوهة (§10 من الإضافات)
رصد: دخول فاشل متكرر · دفعات غير معتادة · طلبات متكررة من نفس الجهاز ·
استخدام كوبون شاذ · إحالات من نفس IP/الجهاز · عمولات غير طبيعية.
⇒ وسم للمراجعة الإدارية + تسجيل القرار في `audit_logs`. **لا قرار مالي
يُتخذ من الواجهة.**

## 16.13 نظام الموافقات (§11 من الإضافات)
`Pending Review → Approved | Rejected` مع تسجيل المنفّذ والتاريخ والسبب،
على: Refund · Partner Payout · تعديل عمولة · تعطيل متجر · تغييرات مالية
استثنائية. فصل المهام — **Q9**.

## 16.14 قائمة فحص ما قبل الإطلاق
- [ ] `get_advisors` على Supabase (security + performance) = **صفر تحذيرات حرجة**
- [ ] كل جدول: RLS مفعّل + سياسة صريحة لكل أمر
- [ ] اختبارات عزل المستأجرين تمر 100%
- [ ] لا `for all` في أي سياسة
- [ ] لا سياسة ارتدادية (كل فحص دور عبر `app.*`)
- [ ] الجداول الإلحاقية محمية بـREVOKE + triggers
- [ ] Service Role غير مستورد من أي مسار مستخدم
- [ ] لا أسرار في المستودع (فحص `gitleaks` في CI)
- [ ] CSP مفعّل بلا `unsafe-eval`
- [ ] Rate Limiting فعّال على كل نقطة في §12.6
- [ ] كل رفع ملف يمر بفحص MIME وMagic Bytes
- [ ] لا بيانات Mock في الإنتاج
- [ ] **2FA إلزامي لحسابات Admin** ومفروض خادميًا (`aal2`) — D28
