# 6. Subscription & Entitlements Engine

> الباقات **ليست صفحة أسعار** — هي محرّك يتحكم فعليًا في ما يستطيع كل
> متجر فعله، ويُطبَّق في ثلاث طبقات: الواجهة والخادم وقاعدة البيانات.

## 6.1 البنية

```
plans ──1:N──▶ plan_entitlements (feature_key, limit_value | bool_value)
  │
  └──▶ subscriptions (store_id, plan_id, status, current_period_end, grace_ends_at)
             │
             ├──▶ subscription_events  (سجل إلحاقي لكل تغيّر)
             ├──▶ subscription_requests (طلب + إثبات تحويل)
             └──▶ payments ──▶ ledger_entries ──▶ commission_ledger
```

**مفتاح التصميم:** الحدود صفوف بيانات لا ثوابت كود ⇒ Admin يعدّل الباقات
والحدود من اللوحة فينعكس فورًا على كل نقاط النظام (§19) بلا نشر.

## 6.2 مفاتيح الميزات

| `feature_key` | النوع | نقطة الإنفاذ |
|---|---|---|
| `products.max` | حد | قبل إنشاء منتج (RPC) |
| `employees.max` | حد | قبل إرسال دعوة موظف |
| `storage.mb` | حد | قبل توقيع رفع ملف |
| `coupons.max_active` | حد | قبل تفعيل كوبون |
| `promotions.max_active` | حد | قبل تفعيل عرض |
| `orders.monthly_max` | حد | داخل `create_order` |
| `custom_domain.enabled` | منطقي | قبل إضافة دومين |
| `analytics.advanced` | منطقي | صفحة الإحصائيات + API |
| `import_export.enabled` | منطقي | رفع CSV / طلب تصدير |
| `variants.enabled` | منطقي | إنشاء متغيّر |
| `whatsapp.enabled` | منطقي | إعدادات المتجر |

> قيم الحدود لكل باقة **لا تُخترع** (D18). حتى تُدخَل من `/admin/plans`
> يبقى `limit_value = null` (بلا حد) مع وسم `TODO-LIMIT`، ولن يُخترع رقم.

## 6.3 دورة حياة الاشتراك

```
             ┌──────────┐  دفع مؤكَّد
             │ trialing ├──────────────┐
             └────┬─────┘              ▼
    انتهاء التجربة │              ┌─────────┐   قرب الانتهاء
                  └─────────────▶│ active  ├──────────────▶ expiring
                                  └────┬────┘                   │
                                       │                        │ انقضاء الفترة
                         إلغاء بطلب     │                        ▼
                                       ▼                    ┌───────┐
                                 ┌───────────┐              │ grace │
                                 │ cancelled │              └───┬───┘
                                 └───────────┘   دفع مؤكَّد ◀────┤ انقضاء السماح
                                       ▲                        ▼
                    قرار إداري          │                   ┌─────────┐
                 ┌───────────┐          └───────────────────┤ expired │
                 │ suspended │◀─── من أي حالة               └────┬────┘
                 └─────┬─────┘                                   │ دفع مؤكَّد
                       └───────────── رفع الإيقاف ───────────────┘→ active
```

| الحالة | المعنى | المتجر للزبائن | لوحة التاجر |
|---|---|---|---|
| `trialing` | تجربة سارية | يعمل كاملًا | كامل بحدود باقة التجربة |
| `active` | مدفوع وسارٍ | يعمل كاملًا | كامل |
| `expiring` | قارب الانتهاء | يعمل كاملًا | كامل + تنبيه دائم |
| `grace` | انقضى ولم يُدفع، ضمن السماح | يعمل كاملًا | كامل + تحذير قوي |
| `expired` | انقضت فترة السماح | **حسب القرار Q2** | قراءة فقط + التجديد والدعم والتصدير |
| `suspended` | إيقاف إداري | متوقف («المتجر غير متاح») | قراءة فقط + الدعم فقط |
| `cancelled` | إلغاء بطلب التاجر | كما `expired` | كما `expired` |

**ثوابت غير قابلة للخرق:**
- لا حذف متجر ولا منتجات ولا طلبات ولا سجلات مالية في أي حالة.
- التاجر يستطيع **دائمًا** الدخول إلى الاشتراك والدعم وتصدير بياناته.
- الانتقالات تتم حصريًا في `transition_subscription()` وتُسجَّل في
  `subscription_events`.
- `expiring` و`grace` و`expired` يقودها **pg_cron كل 5 دقائق**، لا زيارة
  المستخدم ⇒ لا متجر «يبقى حيًا لأن أحدًا لم يفتح اللوحة».

## 6.4 طبقات إنفاذ الحدود

| الطبقة | الدور | مثال |
|---|---|---|
| **1. الواجهة** | تجربة استخدام فقط — **ليست أمانًا** | «منتجاتك 48/50» + زر إضافة معطّل مع دعوة للترقية |
| **2. الخادم** | `assertWithinLimit(storeId,'products.max')` في كل Server Action | يرمي `LimitExceededError` برسالة عربية + رابط الترقية |
| **3. القاعدة** | داخل RPC الإنشاء، في نفس معاملة الإدراج | يحصّن ضد الاستدعاء المباشر لـPostgREST وضد السباق |

```sql
create or replace function app.assert_within_limit(p_store_id uuid, p_key text)
returns void language plpgsql security definer as $$
declare v_limit int; v_used int;
begin
  select pe.limit_value into v_limit
  from subscriptions s
  join plan_entitlements pe on pe.plan_id = s.plan_id and pe.feature_key = p_key
  where s.store_id = p_store_id
    and s.status in ('trialing','active','expiring','grace');

  if not found then raise exception 'SUBSCRIPTION_INACTIVE' using errcode='P0002'; end if;
  if v_limit is null then return; end if;          -- بلا حد

  v_used := app.count_usage(p_store_id, p_key);    -- عدّ حقيقي، لا عداد مخزَّن
  if v_used >= v_limit then
    raise exception 'LIMIT_EXCEEDED:%:%:%', p_key, v_used, v_limit using errcode='P0001';
  end if;
end $$;
```
> **العدّ الحقيقي لا عدّاد مخزَّن:** عدّاد يمكن أن ينحرف؛ `count(*)` مع
> فهرس جزئي دقيق دائمًا وتكلفته مهملة على هذا الحجم.

**ذرّية ضد السباق:** الفحص والإدراج داخل **نفس** الدالة/المعاملة مع
`SELECT ... FOR UPDATE` على صف الاشتراك ⇒ طلبان متزامنان لا يتجاوزان الحد.

## 6.5 الانتقالات بين الباقات

### Upgrade
1. `subscription_requests` بباقة أعلى + إثبات تحويل.
2. Admin يعتمد ⇒ `record_payment(kind='subscription')` داخل معاملة واحدة:
   - `payments` (paid) → `ledger_entries` (إيراد) →
     `post_commission_for_payment()` (عمولة على **المدفوع فعليًا**) →
     `subscriptions.plan_id` يتغير → `subscription_events('upgraded')` →
     إشعار + بريد + فاتورة.
3. الميزات الجديدة سارية فورًا (الحدود تُقرأ من الباقة الحالية لحظيًا).
4. **الترحيل الزمني:** هل يُحتسب المتبقي من الباقة القديمة؟ المواصفات
   لا تذكر — الافتراضي المخطَّط: **تمديد بسيط** (`current_period_end =
   greatest(now, current_period_end) + duration`) بلا تناسب مالي، لأنه
   الأوضح للتاجر مع الدفع اليدوي.

### Downgrade
1. يسري عند **نهاية الفترة الحالية** (لا إلغاء لما دُفع).
2. ❌ **لا يُحذف شيء**: المنتج رقم 51 يبقى موجودًا ومنشورًا.
3. ما يُمنع هو **الجديد فقط**: لا إضافة منتج جديد فوق الحد، مع رسالة
   واضحة وخيار الترقية أو أرشفة منتج بيد التاجر.
4. ميزة منطقية تُغلق (مثل الدومين المخصص): الدومين **يبقى مسجّلًا**
   وحالته `suspended`؛ يعود بالترقية بلا إعادة تحقق.
5. لا عمولة سالبة للشريك (محسوم في المواصفات).

### Expiration → Reactivation
- `expired` ⇒ المتجر قابل للزيارة والشراء معطّل (D14)، واللوحة للقراءة فقط.
- عند دفع مؤكَّد: `active` فورًا، كل شيء يعود كما كان (لا شيء فُقد).
- **العمولة عند التجديد:** كل دفعة مؤكَّدة تولّد عمولة للشريك المرتبط،
  ولو بعد انقطاع — العلاقة دائمة (محسوم في المواصفات).

## 6.6 تجربة المستخدم عند تجاوز الحد

**ممنوع** الفشل الغامض. الاستجابة الموحّدة:
```json
{ "error": { "code": "LIMIT_EXCEEDED", "feature": "products.max",
  "used": 50, "limit": 50,
  "message": "وصلت إلى الحد الأقصى للمنتجات في باقتك الحالية (50 منتجًا).",
  "action": { "label": "ترقية الباقة", "href": "/dashboard/subscription" } } }
```
تعرضها الواجهة كبطاقة ترقية، لا كـToast خطأ أحمر.

## 6.7 مهام الاشتراك الخلفية (pg_cron)

| المهمة | الدورية | العمل |
|---|---|---|
| `sweep_subscriptions` | كل 5 دقائق | `active→expiring` · `expiring→grace` · `grace→expired` + أحداث وإشعارات |
| `notify_expiring` | يوميًا 08:00 (Africa/Khartoum) | تنبيه واحد قبل **7 أيام** (D16) + `dedupe_key` يمنع التكرار |
| `recompute_usage` | ليليًا | مطابقة الاستهلاك المعروض وكشف أي انحراف |
