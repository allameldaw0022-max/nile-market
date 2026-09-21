# 9. Partner · Referral · Commission System

## 9.1 القاعدة المالية المعتمدة

> **عمولة الشريك = 50% من صافي المبلغ المدفوع فعليًا بعد الخصم.**

```
السعر المعلن  = 20,000
الخصم         =  5,000
المدفوع فعليًا = 15,000   ← هذا هو الأساس (base_amount)
─────────────────────────
عمولة الشريك  =  7,500   (50%)
حصة المنصة    =  7,500
```

القواعد الملزمة (كلها محسومة في المواصفات):
1. **لا دفع ⇒ لا عمولة.** الأساس هو المحصَّل فعليًا، لا المفوتر ولا المعلن.
2. كل اشتراك/تجديد/**ترقية** مدفوعة تولّد عمولة. العلاقة **دائمة**.
3. **تخفيض الباقة لا يولّد عمولة سالبة.**
4. استرداد كامل ⇒ **Commission Reversal** بقيد جديد، لا حذف للأصل.
5. استرداد جزئي ⇒ عكس النسبة المقابلة فقط.
6. تغيير نسبة شريك يسري على **المستقبل فقط**؛ لا إعادة حساب للماضي.
7. العمولة لا تُحسب أبدًا من قيمة ترسلها الواجهة.
8. الشريك لا يعدّل نسبته ولا علاقة الإحالة بنفسه.
9. عدد الشركاء **غير محدود** معماريًا (الشخصان الحاليان = أول حسابين).

## 9.2 التدفق الكامل

```
Admin ينشئ شريكًا (اسم·بريد·هاتف·حالة)
   └─ يولَّد referral_code فريد + رابط
        https://nilemarket.online/?ref=<code>
   └─ دعوة آمنة بالبريد (token_hash) → الشريك يكمل حسابه عبر Supabase Auth

زائر يفتح الرابط
   └─ Route Handler خادمي: يتحقق أن الكود لشريك active
        ├─ يسجّل referral_visits (partner_id, visitor_token, ip_hash)
        └─ يضع كوكي HttpOnly · SameSite=Lax · 30 يومًا
             ↑ كوكي خادمي فقط — لا localStorage (لا يُعدَّل من الواجهة)

التاجر يسجّل ثم ينشئ متجرًا
   └─ create_store() تقرأ الكوكي **خادميًا** وتطبّق قاعدة الإسناد (Q5)
        └─ referrals(partner_id, store_id)  ← unique على store_id
             + stores.referred_by_partner_id  ← لا يُعدَّل من واجهة التاجر

دفعة اشتراك تُعتمد → record_payment(kind='subscription') داخل معاملة واحدة
   └─ post_commission_for_payment(payment_id)
        ├─ هل للمتجر referral؟ وهل الشريك active؟
        ├─ base = payments.amount (المدفوع فعليًا بعد الخصم)
        ├─ rate = partners.commission_rate (لقطة الآن)
        ├─ amount = round(base * rate/100, 2)
        ├─ INSERT commission_ledger (entry_kind='commission', status='payable')
        │     ↑ unique(payment_id) حيث entry_kind='commission'
        └─ INSERT ledger_entries (debit platform / credit partner)

الشريك يطلب الصرف → partner_payouts(pending_review)
   └─ Admin يعتمد (بمستخدم مختلف إن فُعِّل فصل المهام — Q9)
        └─ mark_payout_paid() داخل معاملة واحدة:
             ├─ يربط صفوف commission_ledger المحددة بـpayout_id
             ├─ يحوّلها إلى status='paid'
             └─ ledger_entries (debit partner · partner_payout)
```

## 9.3 موانع التلاعب — كل خطر وحاجزه

| الخطر | الحاجز |
|---|---|
| **عمولة مكررة لنفس الدفعة** | `unique (payment_id) where entry_kind='commission'` — حاجز **بنيوي**، لا فحص وقت تشغيل |
| **متجر منسوب لشريكين** | `unique (store_id)` على `referrals` |
| **تلاعب بالمبلغ من الواجهة** | `base_amount` يُقرأ من `payments.amount` داخل القاعدة؛ لا وسيط مبلغ في الدالة إطلاقًا |
| **تلاعب بمعرّف الإحالة** | الكوكي HttpOnly خادمي + الكود يُترجم في القاعدة إلى `partner_id` |
| **تزوير الإسناد الذاتي** | منع إسناد متجر لشريك يملكه نفس `profile_id`؛ ورصد الأنماط في `referral_visits` (IP/جهاز) |
| **صرف مزدوج** | صف عمولة مرتبط بـ`payout_id` لا يُلتقط ثانية؛ وكل طلب صرف له `idempotency_key` فريد |
| **حذف/تعديل عمولة** | `REVOKE UPDATE, DELETE` + trigger `block_mutation` |
| **تعديل تاريخي** | العكس بقيد جديد يشير إلى الأصل بـ`reverses_id` |
| **تكرار Webhook مستقبلي** | `payments.external_event_id unique` + `idempotency_keys` |
| **تغيير النسبة بأثر رجعي** | `rate_applied` **ملقَّطة** في كل صف عمولة؛ تعديل `partners.commission_rate` لا يمسّ الصفوف السابقة |
| **رفع النسبة ذاتيًا** | trigger: `commission_rate` لا يُعدَّل إلا بـ`commissions:manage`، ويُسجَّل في `audit_logs` |
| **عمولة على اشتراك مجاني** | `amount = 0` ⇒ لا دفعة ⇒ لا صف عمولة إطلاقًا |

## 9.4 العكس (Reversal)

```sql
create or replace function reverse_commission(p_refund_id uuid)
returns void language plpgsql security definer as $$
declare v_refund refunds%rowtype; v_orig commission_ledger%rowtype;
        v_ratio numeric; v_amount numeric(14,2);
begin
  select * into v_refund from refunds where id = p_refund_id;
  select * into v_orig from commission_ledger
    where payment_id = v_refund.payment_id and entry_kind = 'commission';
  if not found then return; end if;                    -- لا عمولة أصلًا

  -- استرداد جزئي ⇒ نسبة مقابلة؛ كامل ⇒ 100%
  v_ratio  := v_refund.amount / (select amount from payments where id = v_refund.payment_id);
  v_amount := round(v_orig.amount * v_ratio, 2);

  insert into commission_ledger (partner_id, store_id, referral_id, payment_id,
    subscription_id, entry_kind, base_amount, rate_applied, amount,
    reverses_id, refund_id, status)
  values (v_orig.partner_id, v_orig.store_id, v_orig.referral_id, null,
    v_orig.subscription_id, 'reversal', v_refund.amount, v_orig.rate_applied,
    -v_amount, v_orig.id, p_refund_id, 'reversed');

  insert into ledger_entries (account_kind, account_id, entry_type, direction,
    amount, refund_id, reverses_entry_id, memo)
  values ('partner', v_orig.partner_id, 'commission_reversal', 'debit',
    v_amount, p_refund_id, null, 'عكس عمولة بسبب استرداد');
end $$;
```

**حالة العمولة المصروفة مسبقًا:** إن كانت `status='paid'` وقت الاسترداد،
يُنشأ قيد العكس كالمعتاد ⇒ **رصيد الشريك يصبح سالبًا** ويُخصم تلقائيًا من
الصرف التالي. لا يُطالَب الشريك بإعادة مبلغ ولا يُعدَّل سجل قديم.
> هذه نتيجة مباشرة لقاعدة «الاسترداد يولّد عكسًا ولا يحذف الأصل»، وأوضحها
> هنا صراحةً لأنها تظهر في لوحة الشريك كرصيد سالب.

## 9.5 لوحة الشريك — ما يراه وما لا يراه

| يرى ✅ | لا يرى ❌ |
|---|---|
| رابط الإحالة + نسخ/مشاركة | مبيعات التاجر أو طلباته |
| عدد التجار المحالين / النشطين | منتجات التاجر أو عملاءه |
| الاشتراكات المدفوعة التي ولّدت عمولة | بيانات التاجر البنكية |
| إجمالي العمولات · المستحقة · المدفوعة | بيانات شركاء آخرين |
| سجل العمولات (تاريخ · متجر · باقة · أساس · نسبة · مبلغ · حالة) | نسبته قابلة للتعديل |
| سجل الدفعات (مبلغ · تاريخ · مرجع · حالة) | علاقة الإحالة قابلة للتغيير |

## 9.6 إدارة الشركاء من Admin

إضافة/تعديل/تفعيل/إيقاف · عرض التجار المرتبطين · عرض الاشتراكات
والمدفوعات المولِّدة للعمولة · مراجعة العمولات · **تسجيل دفعات يدويًا**
(v1: النظام يحسب وAdmin يسجّل الدفع — محسوم في المواصفات §22) · سجل
التحويلات · بحث وفلترة بالشريك والحالة والتاريخ · **كل إجراء حسّاس
يُسجَّل في `audit_logs`**.

## 9.7 اختبارات إلزامية

1. 20,000 − خصم 5,000 = 15,000 ⇒ عمولة **7,500** بالضبط.
2. استدعاء `post_commission_for_payment` مرتين لنفس `payment_id` ⇒ صف واحد.
3. لا دفعة ⇒ لا صف عمولة.
4. استرداد كامل ⇒ صف عكس بنفس المبلغ سالبًا، والأصل **سليم**.
5. استرداد جزئي 40% ⇒ عكس 40% بالضبط.
6. تخفيض باقة ⇒ **لا صف عمولة** ولا سالب.
7. تغيير النسبة إلى 40% ⇒ الصفوف القديمة تبقى 50%، والجديدة 40%.
8. طلبا صرف متزامنان لنفس الرصيد ⇒ واحد ينجح فقط.
9. `UPDATE`/`DELETE` على `commission_ledger` بأي دور ⇒ استثناء.
10. متجر بشريكين ⇒ انتهاك `unique`.
11. ترقية باقة ⇒ عمولة على **مبلغ الترقية المدفوع فعليًا**.
12. تجديد بعد انقطاع ⇒ عمولة تُحتسب (العلاقة دائمة).
