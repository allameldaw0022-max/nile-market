# 7–8. Payments, Orders State Machine & Financial Ledger

## 7.1 نطاق الدفع في الإصدار الأول (محسوم في المواصفات)

| الطريقة | الاستخدام | التأكيد |
|---|---|---|
| **Cash on Delivery** | طلبات المتجر — إن فعّله التاجر | التاجر يؤكد التحصيل عند التسليم |
| **Bank Transfer** | طلبات المتجر + اشتراكات المنصة | رفع إثبات تحويل + تأكيد يدوي |
| **Bankak** | حسب التكامل الرسمي/المتاح **فقط** | **لا API في v1 (D20)** — مسار تحويل وإثبات يدوي، وبنية تقبل Adapter رسميًا لاحقًا |

❌ لا بوابات دفع إلكترونية أخرى في v1. ✅ المعمارية تقبل إضافتها لاحقًا
عبر `PaymentProvider` adapter بلا مساس بـ`orders`/`ledger_entries`.

---

## 7.2 Order State Machine

```
        [إنشاء الطلب]
              │
              ▼
          ┌───────┐
          │  new  │ جديد
          └───┬───┘
              │ confirm ── يحجز المخزون
              ▼
        ┌───────────┐
        │ confirmed │ مؤكَّد
        └─────┬─────┘
              │ prepare
              ▼
        ┌───────────┐
        │ preparing │ قيد التجهيز
        └─────┬─────┘
              │ ship
              ▼
        ┌─────────┐
        │ shipped │ تم الشحن
        └────┬────┘
             │ complete ── (COD: يُسجَّل الدفع هنا)
             ▼
        ┌───────────┐
        │ completed │ مكتمل ◀── حالة نهائية
        └───────────┘

  cancelled ملغي ◀── من: new · confirmed · preparing · shipped
                     (يُرجع المخزون المحجوز)
```

### جدول الانتقالات المسموحة

| من \ إلى | new | confirmed | preparing | shipped | completed | cancelled |
|---|---|---|---|---|---|---|
| **new** | — | ✅ | ➖ | ➖ | ➖ | ✅ |
| **confirmed** | ➖ | — | ✅ | ➖ | ➖ | ✅ |
| **preparing** | ➖ | ⚠️¹ | — | ✅ | ➖ | ✅ |
| **shipped** | ➖ | ➖ | ⚠️¹ | — | ✅ | ✅² |
| **completed** | ➖ | ➖ | ➖ | ➖ | — | ➖³ |
| **cancelled** | ➖ | ➖ | ➖ | ➖ | ➖ | — |

¹ رجوع خطوة واحدة مسموح لـ`owner`/`manager` فقط، **مع سبب إلزامي**.
² إلغاء بعد الشحن (مرتجع) — `owner`/`manager` فقط مع سبب.
³ **`completed` نهائية**. التصحيح المالي يتم بـ`refund`، لا بإرجاع الحالة.

### من يستطيع كل انتقال

| الانتقال | Owner | Manager | Orders | Customer Service | Customer | Admin |
|---|---|---|---|---|---|---|
| new → confirmed | ✅ | ✅ | ✅ | ✅ | ➖ | ⚠️⁴ |
| confirmed → preparing | ✅ | ✅ | ✅ | ➖ | ➖ | ⚠️⁴ |
| preparing → shipped | ✅ | ✅ | ✅ | ➖ | ➖ | ⚠️⁴ |
| shipped → completed | ✅ | ✅ | ✅ | ➖ | ➖ | ⚠️⁴ |
| → cancelled | ✅ | ✅ | ✅ | ⚠️⁵ | ⚠️⁶ | ⚠️⁴ |
| رجوع خطوة | ✅ | ✅ | ➖ | ➖ | ➖ | ⚠️⁴ |

⁴ Admin بصلاحية `orders:manage` فقط، ويُسجَّل باسمه في `audit_logs`.
⁵ من `new` فقط. ⁶ العميل يلغي من `new` فقط وقبل التأكيد.

### الإنفاذ (ثلاثة جدران)

```sql
create or replace function transition_order(
  p_order_id uuid, p_to order_status, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order_id for update;  -- قفل
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if not app.can_transition_order(v_order.status, p_to) then
    raise exception 'ILLEGAL_TRANSITION:%→%', v_order.status, p_to
      using errcode = 'P0001';
  end if;
  if not app.has_store_permission(v_order.store_id,
        app.required_permission_for_transition(v_order.status, p_to)) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_to in ('cancelled') and p_reason is null then
    raise exception 'REASON_REQUIRED';
  end if;

  update orders set status = p_to, updated_at = now(),
    cancelled_at = case when p_to='cancelled' then now() else cancelled_at end,
    completed_at = case when p_to='completed' then now() else completed_at end
  where id = p_order_id;
  -- trigger يكتب order_status_history + audit_logs + يحرّك المخزون + يطلق الإشعار
end $$;
```

**حاجز إضافي:** trigger `BEFORE UPDATE ON orders` يرفض أي تغيير مباشر
لعمود `status` لم يأتِ من داخل هذه الدالة (علامة session
`app.in_transition`) ⇒ لا تلاعب عبر PostgREST ولا عبر Server Action ناسية.

### أثر الحالة على المخزون

| الانتقال | الأثر |
|---|---|
| `new` | `inventory.reserved += qty` (حجز، لا خصم) |
| `→ confirmed` | يبقى الحجز |
| `→ shipped` | `quantity -= qty` · `reserved -= qty` + `inventory_movements(order_placed)` |
| `→ cancelled` (قبل الشحن) | `reserved -= qty` |
| `→ cancelled` (بعد الشحن) | `quantity += qty` + `inventory_movements(order_returned)` |

---

## 7.3 Payment State Machine

```
  ┌─────────┐  تأكيد (تاجر/Admin)   ┌──────┐
  │ pending ├──────────────────────▶│ paid │
  └────┬────┘                       └───┬──┘
       │ رفض / فشل                      │ refund معتمد
       ▼                                ▼
  ┌────────┐                  ┌─────────────────────┐
  │ failed │                  │ partially_refunded  │
  └────────┘                  └──────────┬──────────┘
                                         │ استرداد الباقي
                                         ▼
                                   ┌──────────┐
                                   │ refunded │
                                   └──────────┘
```

| القاعدة | التطبيق |
|---|---|
| `paid` لا تعود إلى `pending` | trigger رفض |
| `amount` غير قابل للتعديل بعد `paid` | trigger رفض |
| لا `DELETE` على `payments` | `REVOKE DELETE` |
| كل دفعة لها `idempotency_key` | `unique(kind, idempotency_key)` |
| كل حدث خارجي له `external_event_id` | `unique` — منع تكرار Webhook |
| COD يصبح `paid` عند `shipped → completed` | داخل نفس معاملة الانتقال |
| `orders.paid_total` مشتق | trigger من `payments`، لا يُكتب يدويًا |

---

## 7.4 حساب المبالغ — **Server-side حصريًا**

```
subtotal       = Σ (unit_price × quantity)           ← السعر من جدول products وقت الطلب
delivery_fee   = delivery_zones.fee للمنطقة المختارة ← ★ لا يأتي من العميل (إصلاح S2)
                 (0 إن بلغ subtotal حد الشحن المجاني)
discount_total = validate_coupon(...)                ← تُحسب في القاعدة
                 نسبة: min(subtotal × value/100, max_discount_amount)
                 ثابت: min(value, subtotal)
total          = subtotal + delivery_fee − discount_total     check (total >= 0)
paid_total     = Σ payments(status='paid').amount
balance_due    = total − paid_total + refunded_total
```

**ما يرسله العميل:** معرّفات المنتجات والكميات، ومعرّف منطقة التوصيل،
وكود الكوبون، وبيانات الاتصال. **لا شيء غير ذلك.**
**ما لا يُقبل من العميل أبدًا:** أي سعر، أي رسوم، أي خصم، أي مجموع، أي
`store_id` (يُشتق من الـHost).

```sql
create or replace function create_order(
  p_cart_id uuid, p_zone_id uuid, p_contact jsonb,
  p_address jsonb, p_coupon_code text, p_payment_method payment_method,
  p_idempotency_key text
) returns uuid language plpgsql security definer ...
-- 1) idempotency: إن وُجد المفتاح، أعد نفس order_id (لا طلب ثانٍ)
-- 2) اقفل صفوف السلة والمنتجات (FOR UPDATE) وأعد قراءة الأسعار
-- 3) تحقق من التوفر والمخزون والحالة والمتجر النشط
-- 4) احسب subtotal/delivery/discount/total من القاعدة
-- 5) احجز order_number من store_order_sequences
-- 6) أدرج orders + order_items + coupon_redemptions + حجز المخزون
-- 7) أنشئ payments(pending) للتحويل البنكي، أو لا شيء لـCOD
-- 8) إشعارات + audit + تحويل السلة إلى converted
```

### منع الطلبات المكررة (§13)
ثلاث طبقات: زر مُعطَّل أثناء الإرسال (واجهة) · `idempotency_key` يولَّد
مرة واحدة عند فتح صفحة الدفع ويُرسل مع الطلب · `unique(store_id,
idempotency_key)` في القاعدة ⇒ الضغط المزدوج يعيد **نفس** الطلب.

---

## 7.5 Financial Ledger

كل حدث مالي = صف **إلحاقي** في `ledger_entries`. لا تعديل ولا حذف.

| الحدث | القيود المنشأة |
|---|---|
| اشتراك مدفوع 15,000 | `credit platform · subscription_revenue · 15,000` |
| عمولة شريك عليه | `debit platform · partner_commission · 7,500` + `credit partner · partner_commission · 7,500` |
| استرداد كامل للاشتراك | `debit platform · refund · 15,000` + قيود عكس العمولة |
| صرف مستحق للشريك | `debit partner · partner_payout · 7,500` |
| تسوية إدارية | `adjustment` بسبب إلزامي ومعتمِد مسجَّل |

الأرصدة عبر VIEW: `SUM(credit) − SUM(debit)` لكل `(account_kind, account_id)`.
لا يوجد عمود `balance` قابل للانحراف أو للتلاعب.

> **ملاحظة نطاق:** هذا Ledger مالي قابل للتدقيق، **وليس نظام محاسبة ERP**
> (محسوم في المواصفات §27).

---

## 7.6 الاستردادات

1. طلب (Admin بصلاحية `payments:approve` أو تاجر عبر الدعم) — سبب إلزامي.
2. `refunds(status='pending_review')`.
3. اعتماد بمستخدم **مختلف** عن الطالب إن فُعِّل فصل المهام (**Q9**).
4. عند الاعتماد، في **معاملة واحدة**: `refunds→completed` ·
   `payments→refunded|partially_refunded` · قيود Ledger عكسية ·
   `reverse_commission()` بالنسبة المقابلة · إشعار + بريد + audit.
5. ❌ لا يُعدَّل ولا يُحذف أي سجل أصلي لإخفاء الاسترداد (محسوم).

`sum(refunds.amount) <= payments.amount` مفروض بـtrigger.

---

## 7.7 الفواتير

تُصدَر عند: اكتمال طلب · تأكيد دفعة اشتراك.
`invoices.snapshot jsonb` يحفظ **لقطة كاملة** (بيانات المتجر والعميل
والبنود والأسعار والضرائب والخصم) ⇒ الفاتورة لا تتغير أبدًا مهما تغيّر
اسم المتجر أو سعر المنتج لاحقًا (§24 «الحفاظ على التاريخ المالي»).
