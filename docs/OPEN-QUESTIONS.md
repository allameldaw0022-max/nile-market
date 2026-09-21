# سجل القرارات النهائية — Decisions Register

> **الحالة: كل القرارات محسومة — D-Q1…D-Q14 و D29…D34.** اعتُمدت من صاحب المشروع
> (أباذر ميرغني) بتاريخ 2026-09-21، وأصبحت **Source of Truth** مع ملف
> المواصفات الأصلي `Nile_Market_Project_Specification_AR_FINAL.docx`.
>
> هذه القرارات **لا يُسأل عنها مرة أخرى** ولا تُعدَّل من طرف المنفّذ.
> أي تغيير لاحق فيها يُسجَّل هنا بتاريخه كقرار جديد يَنسخ السابق.
>
> القسم الأخير (D29–D34) يسجّل النقاط التي نشأت **من** هذه القرارات
> نفسها — وقد حُسمت جميعًا بتاريخ 2026-09-21.
>
> ✅ **لا يوجد أي بند مفتوح. لا Blocking Issues.**

---

## D-Q1 · نظام المسوّقين القديم ومصدر دخل المنصة ✅

**القرار النهائي:**
- نظام المسوّقين القديم **خارج نطاق V1**.
- **لا يُحذف** النظام ولا تُحذف بياناته.
- يبقى خلف **Feature Flag** إن لزم.
- **Partners/Referral الجديد** (الموجود في المواصفات) هو النظام المعتمد في V1.
- `platform_commission_rate` **لا يُستخدم في V1**، ولا توجد أي عمولة على
  مبيعات التجار.
- **مصدر دخل Nile Market في V1 = اشتراكات التجار فقط.**

**الأثر التنفيذي:**
| العنصر | المعاملة |
|---|---|
| `platform_marketers`, `product_marketer_clicks`, `marketer_withdrawal_requests`, `payout_methods`, `wallet_ledger` | تبقى كما هي — لا حذف |
| أعمدة `marketer_*` و`platform_commission_*` على `stores`/`order_items` | تبقى موجودة، **ولا يقرؤها ولا يكتبها أي مسار في V1** |
| واجهات `/marketer/*` و`/admin/marketers-50` | خلف `feature_flags.legacy_marketers = false` |
| احتساب عمولة المنصة على الطلبات | **معطّل تمامًا** — لا trigger ولا قيد Ledger |
| `post_order_item_ledger` (قيد `platform_revenue`) | لا يُفعَّل في V1 |

---

## D-Q2 · سلوك المتجر بعد انتهاء الاشتراك ✅

**القرار النهائي:** بعد انتهاء الاشتراك **وفترة السماح**:
- المتجر **يبقى قابلًا للزيارة**.
- **الشراء وCheckout يتوقفان.**
- تظهر **رسالة عربية واضحة** للزائر.
- **لا يُحذف** أي Store Data أو Products أو Orders أو Financial Records.

**الأثر التنفيذي:**
- `StoreContext` يحمل `canCheckout: boolean`؛ عند `false`: زر «إضافة
  للسلة» و`/cart` و`/checkout` معطّلة، و`create_order` **ترفض في القاعدة**
  (لا حماية بالواجهة وحدها).
- المتجر يبقى مفهرسًا: الصفحات والـSEO وSitemap تعمل، وبطاقة المنتج تعرض
  السعر بلا زر شراء.
- الرسالة المعتمدة: «هذا المتجر غير متاح للشراء حاليًا».

---

## D-Q3 · دورة الاشتراك ✅

**القرار النهائي:**
- **لا Trial إجباري في V1.**
- **Free باقة دائمة**، وليست تجربة.
- **Grace Period = 7 أيام.**
- **Expiring Warning = قبل 7 أيام** من نهاية الاشتراك.
- **التجديد يدوي بإثبات دفع.**
- **لا Auto-renewal في V1.**

**الأثر التنفيذي:**
- يُلغى منح الـ30 يومًا التلقائي الموجود في الكود الحالي
  (`grant_seller_trial`)، ولا يُنشأ أي `plan` بـ`is_trial`.
- حالة `trialing` تبقى معرَّفة في آلة الحالة **غير مستخدمة** في V1
  (لا تُحذف — تمكينها لاحقًا قرار إداري لا إعادة بناء).
- `platform_settings.grace_period_days = 7` ·
  `expiring_warning_days = 7` · `auto_renew_enabled = false`.
- تنبيه واحد عند 7 أيام (لا 7/3/1)، بـ`dedupe_key` يمنع التكرار.
- المتجر الجديد يبدأ على **Free** مباشرة بلا فترة تجريبية.
- `subscriptions.auto_renew` يبقى عمودًا بقيمة `false` دائمًا في V1.

---

## D-Q4 · أسعار الباقات وحدودها ✅

**القرار النهائي:**
- أسعار Free / Basic / Pro وحدودها **لا تُخترع**.
- **Admin يعدّل الأسعار والحدود** من اللوحة.
- أي Limit غير محدد **يبقى بلا رقم افتراضي**.
- **ممنوع إنشاء أي Business Rule من طرف المنفّذ.**

**الأثر التنفيذي:**
- تُنشأ ثلاث باقات بأسمائها فقط (`free`, `basic`, `pro`) بسعر `0` قابل
  للتعديل.
- كل صف في `plan_entitlements` يُنشأ بـ`limit_value = null` (بلا حد)
  ووسم `TODO-LIMIT`.
- `assert_within_limit` تمرّ فورًا عندما تكون القيمة `null` ⇒ النظام
  يعمل بلا أرقام، ويبدأ الإنفاذ **لحظة إدخالك القيم** من
  `/admin/plans` بلا نشر كود.
- تقرير في `/admin/plans` يعرض كل `TODO-LIMIT` غير مضبوط.

---

## D-Q5 · قاعدة إسناد الإحالة ✅

**القرار النهائي:**
- **Referral Attribution = Last-touch.**
- **Attribution Window = 30 يومًا.**
- بعد إنشاء علاقة الإحالة **تصبح ثابتة** وفق المواصفات، **ولا تتغير**
  بسبب روابط لاحقة.

**الأثر التنفيذي:**
- كوكي `nm_ref` **HttpOnly · Secure · SameSite=Lax · 30 يومًا**، يُكتب
  **خادميًا** فقط من Route Handler بعد التحقق من أن الكود لشريك `active`
  — لا `localStorage` (الكود الحالي يستخدم `localStorage`؛ يُستبدل).
- زيارة رابط شريك جديد داخل النافذة **تستبدل** قيمة الكوكي (Last-touch).
- عند `create_store()` يُقرأ الكوكي خادميًا ⇒ `referrals(partner_id, store_id)`
  بـ`unique(store_id)` و`locked = true`.
- **بعد الإنشاء:** أي رابط لاحق لا يغيّر شيئًا — العلاقة نهائية.
- `referral_visits` تحتفظ بسجل الزيارات لأغراض التدقيق وكشف التلاعب.

---

## D-Q6 · بنكك وبنية الدفع ✅

**القرار النهائي:**
- **لا تكامل Bankak API مفترض في V1.**
- يُعامَل كـ**تحويل/إثبات دفع يدوي**.
- **ممنوع اختراع API.**
- Payment Architecture تسمح بإضافة **Adapter رسمي لاحقًا** دون إعادة بناء
  النظام المالي.

**الأثر التنفيذي:**
- `payments.method = 'bankak'` قيمة صالحة، مسارها = مسار التحويل البنكي
  (مرجع + إثبات + تأكيد يدوي).
- واجهة `PaymentProvider` معرَّفة من الآن، ومحوّل V1 = `ManualTransferProvider`.
- `payments.external_event_id` و`idempotency_key` و`payment_events`
  موجودة منذ البداية ⇒ إضافة Webhook لاحقًا **لا تمسّ** `orders` ولا
  `ledger_entries` ولا `commission_ledger`.

---

## D-Q7 · الاستضافة والدومينات ✅

**القرار النهائي:**
- **لا اعتماد على Vercel Hobby** كحل إنتاج نهائي لمنصة SaaS تجارية مدفوعة.
- المعمارية **تعزل Provider الاستضافة والدومينات** بحيث يمكن الانتقال إلى
  Vercel Pro أو Cloudflare أو خادم آخر لاحقًا **دون إعادة بناء**
  Multi-Tenant Architecture.

**الأثر التنفيذي:**
```ts
// lib/tenant/provider.ts — الحدّ الوحيد الذي يعرف المستضيف
export interface HostingProvider {
  addDomain(hostname: string): Promise<void>;
  removeDomain(hostname: string): Promise<void>;
  getDomainStatus(hostname: string): Promise<DomainStatus>;
  getCertificateStatus(hostname: string): Promise<CertStatus>;
}
```
- Multi-Tenant Routing يعتمد على `store_domains` + الـHost **فقط** — لا
  خاصية خاصة بأي مستضيف.
- `proxy.ts` منطق قياسي (Host → rewrite) يعمل على أي منصة تدعم
  Middleware/Edge أو Node.
- تبديل المستضيف = تبديل تنفيذ واحد لهذه الواجهة.

---

## D-Q8 · هوية العميل والعزل ✅

**القرار النهائي:**
- **هوية Auth واحدة** للعميل.
- **Customer record منفصل لكل Store.**
- Store A **لا يستطيع** معرفة أو الوصول إلى نشاط/بيانات العميل في
  Store B إلا بصلاحية **صريحة ومحددة** من النظام.
- **Tenant isolation إلزامي.**

**الأثر التنفيذي:**
- `customers` بـ`store_id` + `profile_id` nullable، و
  `unique(store_id, profile_id)`.
- تسجيل دخول واحد يعمل في كل المتاجر، ويُنشأ سجل عميل مستقل عند أول
  تفاعل مع كل متجر.
- **لا يوجد في V1 أي مسار يمنح متجرًا رؤية نشاط عميله في متجر آخر** —
  ولا تُنشأ أي صلاحية من هذا النوع. البند محفوظ كنقطة توسّع مستقبلية
  تتطلب قرارًا مستقلًا.
- `profiles` لا يُقرأ من الـStorefront إطلاقًا؛ المتجر يرى `customers`
  الخاص به فقط.
- مغطّى باختبارات العزل الإلزامية في `TESTING.md §19.2`.

---

## D-Q9 · فصل المهام (Separation of Duties) ✅

**القرار النهائي:**
- **إجباري** في: **Refund** و**Partner Payout**.
- **طالب العملية ≠ معتمِدها.**
- للعمليات الحساسة الأخرى: **قابل للتفعيل من Admin**.

**الأثر التنفيذي:**
- قيد على مستوى القاعدة: `check (approved_by is distinct from requested_by)`
  على `refunds` و`partner_payouts` — لا يُتجاوز من أي واجهة.
- `platform_settings.sod_enabled jsonb` لبقية العمليات (تعديل عمولة ·
  تعطيل متجر · تسويات مالية) — افتراضيًا **مطفأ**، يُفعّله Admin.
- كل موافقة تُسجَّل في `audit_logs` بالمنفّذ والتاريخ والسبب.
- ⚠️ يستلزم **حسابَي Admin نشطين على الأقل** — راجع التعارض **C1** أدناه.

---

## D-Q10 · مزوّد البريد ✅

**القرار النهائي:**
- **Resend** مزوّد البريد في V1.
- `EmailProvider` abstraction يسمح بتغييره لاحقًا **دون إعادة كتابة**
  نظام الإشعارات.
- يُستخدم لـ: تأكيد البريد · إعادة تعيين كلمة المرور · الدعوات ·
  الاشتراكات · الطلبات · الدعم · التنبيهات الأمنية وغيرها حسب المواصفات.

**الأثر التنفيذي:**
- `ResendProvider implements EmailProvider`، ويُضبط أيضًا كـ
  **Custom SMTP داخل Supabase Auth** (بريد Supabase المدمج غير إنتاجي).
- `EMAIL_PROVIDER_API_KEY` و`EMAIL_FROM` متغيرا بيئة خادميان.
- القوالب عربية RTL مع نسخة نصية، في `lib/email/templates/`.
- الإرسال عبر `email_outbox` حصرًا — **لا إرسال داخل دورة الطلب**.
- يتطلب تحقق ملكية النطاق (SPF/DKIM) على `nilemarket.online`.

---

## D-Q11 · حدّ صرف مستحقات الشريك ✅

**القرار النهائي:**
- **لا Minimum Payout في V1.**
- صرف الشريك **يدوي من Admin عند الطلب**.
- `minimum_payout` **قابل للضبط لاحقًا** من `platform_settings` بلا فرض
  قيمة حاليًا.

**الأثر التنفيذي:**
- `platform_settings.min_payout_amount numeric(14,2) null` — `null` = لا حد.
- الشريك يطلب الصرف بأي رصيد موجب؛ والاعتماد يخضع لـ**D-Q9**.

---

## D-Q12 · الاحتفاظ بالبيانات ✅

**القرار النهائي:**
- البيانات **غير المالية** عند طلب حذف الحساب: **Retention = 30 يومًا ثم
  Anonymization**.
- **تذاكر الدعم المغلقة: Retention = 24 شهرًا.**
- **Financial records وAudit records لا تُحذف** بسبب إغلاق الحساب.

**الأثر التنفيذي:**
- `account_deletion_requests(profile_id, requested_at, execute_after)`
  مع `execute_after = requested_at + 30 days` ⇒ نافذة تراجع.
- Job ليلي يُجري Anonymization: `full_name` → «مستخدم محذوف» ·
  `phone`/`email`/`avatar_url` → `null` · `account_status = 'closed'`.
- `payments` · `refunds` · `ledger_entries` · `commission_ledger` ·
  `invoices` · `audit_logs` · `subscription_events` — **لا تُمسّ إطلاقًا**.
- راجع التعارض **C4** أدناه بخصوص لقطة بيانات الاتصال على الطلبات.

---

## D-Q13 · تغيير Store Slug ✅

**القرار النهائي:**
- الـslug القديم يعمل **Redirect 301 دائم**.
- الـslug القديم **يُحجز 12 شهرًا** لمنع Takeover أو استغلال الروابط القديمة.
- المدة **قابلة للضبط لاحقًا**.

**الأثر التنفيذي:**
- `reserved_slugs(slug, reserved_until, reason='slug_change', store_id)`.
- صف `store_domains` للنطاق الفرعي القديم يبقى بـ`redirect_to_primary`
  ⇒ 301 مع الحفاظ على المسار.
- `platform_settings.slug_reservation_months = 12`.
- راجع التعارض **C5** أدناه («دائم» مقابل «12 شهرًا»).

---

## D-Q14 · المصادقة الثنائية ✅

**القرار النهائي:**
- **2FA/MFA يُنفَّذ في V1 لحسابات Admin.**
- عبر **TOTP/MFA المتاح في Supabase**.
- النظام **قابل لتوسيع MFA لاحقًا** لبقية الأدوار.

**الأثر التنفيذي:**
- `admin_members.mfa_required boolean not null default true`.
- `requirePlatformAccess()` ترفض أي جلسة Admin بلا `aal2` ⇒ الحماية على
  **الخادم**، لا في الواجهة.
- `/admin/*` يعيد توجيه من لم يُفعّل MFA إلى صفحة التفعيل الإلزامي.
- البنية عامة (`mfa_required` قابل للتعميم) ⇒ توسيعها لأدوار المتجر
  لاحقًا = تغيير إعداد لا إعادة بناء.
- ⚠️ راجع التعارض **C1**.

---

# القرارات المكمّلة C1–C6 (D29–D34) ✅

> نقاط نشأت من القرارات D-Q1…D-Q14، **حُسمت جميعًا** من صاحب المشروع
> بتاريخ 2026-09-21. لم يبقَ أي بند مفتوح في هذا الملف.

---

## D29 · (C1) حسابا Admin وفصل المهام بلا استثناء ✅

**القرار النهائي:**
- **حسابا Admin نشطان على الأقل** عند الإطلاق.
- **كلاهما بـMFA/2FA مفعّل.**
- **لا يوجد أي bypass** لقاعدة `approved_by != requested_by`.
- Refund وPartner Payout يتطلبان **دائمًا** شخصًا للطلب وشخصًا **مختلفًا**
  للاعتماد.
- **لا يُسمح للواجهة ولا لـService Role بتجاوز القاعدة.**

**الأثر التنفيذي:**
```sql
alter table refunds add constraint refunds_sod
  check (approved_by is distinct from requested_by
     and approved_by is distinct from initiated_by);

alter table partner_payouts add constraint payouts_sod
  check (approved_by is distinct from requested_by
     and approved_by is distinct from initiated_by);
```
- **لماذا `CHECK` وليس trigger أو RLS؟** قيد `CHECK` يُفرض على **كل**
  الأدوار بلا استثناء — بما فيها `service_role`. تجاوز RLS **لا يتجاوز
  القيود**، فهذه هي الآلية الوحيدة التي تحقق «لا bypass» حرفيًا.
- `CHECK` لا يقبل استعلامات فرعية، لذا يكمّله **trigger تحققي** يفرض أن
  `requested_by` و`approved_by` كلاهما `admin_members` بحالة `active`
  و`mfa_required` محقّق.
- بوابة إطلاق: النظام يرفض تفعيل الإطلاق التجاري إذا كان عدد حسابات
  Admin النشطة بـMFA **أقل من 2** (يُعرض كبند في
  `/admin/system-health`).
- كل اعتماد يُسجَّل في `audit_logs` بالمنفّذ والتاريخ والسبب.

---

## D30 · (C2) سلسلة الطلب والاعتماد ✅

**القرار النهائي:**
- الشريك **يستطيع إنشاء طلب صرف**، لكن **طلبه ليس اعتمادًا**.
- **تدفق صرف الشريك:**
  `Partner ينشئ طلبًا → Admin Staff يسجّل/يعالج → Admin آخر يعتمد → تنفيذ وتسجيل الدفع`
- **تدفق الاسترداد:**
  `Customer/Merchant يطلب → Admin يسجّل/يعالج → Admin مختلف يعتمد → إنشاء Financial Reversal / Ledger Entry`
- **لا يكون requester وapprover نفس الشخص** حتى لو كان الطالب شريكًا أو
  عميلًا أو تاجرًا.

**الأثر التنفيذي:** ثلاثة أطراف صريحة على `refunds` و`partner_payouts`:

| العمود | من | ملاحظة |
|---|---|---|
| `initiated_by` + `initiated_by_kind` | الشريك / العميل / التاجر | صاحب الطلب الأصلي — **ليس طرفًا في الاعتماد** |
| `requested_by` | **موظف Admin** يسجّل ويعالج | الطرف الأول في فصل المهام |
| `approved_by` | **موظف Admin آخر** | الطرف الثاني — يختلف عن الاثنين أعلاه |

- القيد في D29 يقارن `approved_by` بـ**كليهما** (`requested_by`
  و`initiated_by`) ⇒ لا يعتمد أحد طلبًا شارك في إنشائه بأي صفة.
- طلب الشريك يبدأ بحالة `submitted`؛ لا يدخل `pending_review` إلا بعد
  تسجيل موظف Admin له ⇒ **طلب الشريك وحده لا يحرّك مالًا أبدًا**.
- نفس النمط للاسترداد: طلب التاجر/العميل عبر الدعم = `initiated_by`، ثم
  تسجيل إداري، ثم اعتماد بشخص ثالث مختلف.

---

## D31 · (C3) بوابة اكتمال إعداد الباقات قبل الإطلاق التجاري ✅

**القرار النهائي:**
- **لا تُخترع أسعار ولا Limits.**
- أثناء التطوير: القيم يمكن أن تبقى **غير محددة**.
- **قبل الإطلاق التجاري**: تُدخل الأسعار والحدود من Admin.
- **النظام يمنع تفعيل الإطلاق التجاري** إذا كانت القيم المطلوبة للباقات
  الأساسية غير مكتملة، أو يعرض حالة واضحة بأن **Plan Configuration غير
  مكتمل**.

**الأثر التنفيذي:**
- `plan_entitlements.configured_at timestamptz null` — `null` يعني **لم
  يُضبط بعد**. Admin يضبط كل مفتاح صراحةً إلى **رقم** أو **«بلا حد»**،
  فتُختم `configured_at`. هكذا نميّز «بلا حد بقرار» عن «لم يُحسم» **دون
  افتراض أي رقم**.
- `platform_settings.commercial_launch_enabled boolean default false`.
- `app.plan_configuration_status()` تُرجع: الباقات الناقصة، والمفاتيح
  غير المضبوطة، وأسعار الباقات المدفوعة غير المحددة.
- **بوابة الإطلاق:** تفعيل `commercial_launch_enabled` يُرفض ما لم تكن
  الحالة مكتملة (وكذلك شرط حسابَي Admin في D29).
- لافتة دائمة في `/admin` و`/admin/plans`: «⚠️ Plan Configuration غير
  مكتمل — الإطلاق التجاري معطّل» مع قائمة الناقص.
- النظام يعمل تطويريًا بقيم غير مضبوطة (الحدود لا تُنفَّذ)، ويبدأ
  الإنفاذ لحظة الضبط.

---

## D32 · (C4) نطاق Anonymization ✅

**القرار النهائي:** عند حذف/إغلاق حساب العميل وبعد فترة الاحتفاظ:

**يُخفى (Anonymization):**
`profiles` · `customers` · `customer_addresses` · وأي بيانات شخصية غير
مطلوبة للاحتفاظ القانوني/المالي.

**لا يُعدَّل ولا يُخفى إطلاقًا:**
`orders` · `order_items` · `invoices` · **السجلات المالية** — لأنها جزء
من السجل التاريخي والمالي.

**يُوثَّق بوضوح في Privacy / Data Retention Policy.**

**الأثر التنفيذي:**
| الجدول | الإجراء بعد 30 يومًا |
|---|---|
| `profiles` | `full_name` → «مستخدم محذوف» · `phone`/`avatar_url` → `null` · `account_status='closed'` |
| `customers` | `name` → «عميل محذوف» · `phone`/`email`/`notes` → `null` |
| `customer_addresses` | حذف منطقي + تفريغ الحقول النصية |
| `orders` (`contact_name`, `contact_phone`, `delivery_address`) | **لا يُمسّ** |
| `order_items` · `invoices.snapshot` | **لا يُمسّ** |
| `payments` · `refunds` · `ledger_entries` · `commission_ledger` · `audit_logs` · `subscription_events` | **لا يُمسّ** |

- يُكتب نص صريح في صفحة الخصوصية يوضح للمستخدم أن بيانات الاتصال
  المرتبطة بطلبات وفواتير سابقة **تبقى محفوظة** ضمن السجل المالي/القانوني
  ولا تُحذف عند إغلاق الحساب.
- Job الـAnonymization مقيّد بقائمة جداول بيضاء صريحة، ويُختبَر بتأكيد أن
  لقطات الطلبات والفواتير لم تتغير.

---

## D33 · (C5) Store Slug — مدة الإعادة والحجز ✅

**القرار النهائي:**
- الـslug القديم → **301 redirect**.
- **مدة الـRedirect والحجز = 12 شهرًا.**
- بعد 12 شهرًا **يمكن تحرير** الـslug القديم وإتاحته لمتجر آخر.
- **لا يُوعَد المستخدم بـ301 دائمة** بعد تحرير الاسم.
- حماية الـslug خلال فترة الحجز ومنع Takeover.

**الأثر التنفيذي:**
- `reserved_slugs(slug, reserved_until, reason='slug_change', store_id)`
  بـ`reserved_until = now() + 12 months`.
- الـ301 نشطة **ما دام** `reserved_until > now()`؛ بعدها يتوقف التوجيه
  ويُحرَّر الاسم.
- خلال الحجز: لا متجر آخر يأخذ الاسم (فحص عند إنشاء/تغيير الـslug).
- Job ليلي يحرّر المنتهية ويبطل الـcaches.
- `platform_settings.slug_reservation_months = 12` (قابل للضبط).
- **واجهة التاجر تذكر المدة صراحةً**: «الروابط القديمة ستعمل 12 شهرًا من
  تاريخ التغيير» — لا وعد بالديمومة.

---

## D34 · (C6) الـMigrations القديمة ✅

**القرار النهائي:**
- المشروع الحالي **بلا بيانات Production مهمة**، وSupabase الحالي **فارغ**.
- **لا تُطبَّق** الـ21 migration القديمة على قاعدة V1.
- تُنقل **كما هي بلا حذف أو تعديل** إلى `supabase/legacy-migrations/`
  مع README يوضح أنها Legacy وليست جزءًا من V1.
- تبدأ migrations جديدة للمخطط الصحيح من `supabase/migrations/0001_...`.
- **ممنوع** حذف أي migration قديمة أو إعادة كتابتها أو خلطها بالجديدة.

**حالة التنفيذ:** ✅ **نُفِّذ** — نقل خالص بـ`git mv` لكل الملفات الـ21،
تحقق `md5sum` من تطابق المحتوى **بايت ببايت**، وGit سجّلها كـ`rename`
بنسبة تشابه 100%. أُضيف
[`supabase/legacy-migrations/README.md`](../supabase/legacy-migrations/README.md)
بفهرس تاريخي وقواعد التعامل. `supabase/migrations/` فارغ وجاهز للمخطط
الجديد.
