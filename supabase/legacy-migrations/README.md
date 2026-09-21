# Legacy Migrations — النظام السابق (خارج نطاق V1)

> ⛔ **هذه الملفات ليست جزءًا من Nile Market V1، ولا تُطبَّق على قاعدة
> بيانات V1.**

## ما هذه الملفات؟

الـ21 migration التي بُني عليها النظام السابق (نموذج Marketplace مركزي
مع نظام مسوّقي منتجات وعمولة على الطلبات). نُقلت إلى هنا **كما هي،
بلا حذف ولا تعديل ولا إعادة ترتيب**، بقرار **D34 (C6)**.

## لماذا نُقلت ولم تُطبَّق؟

- قاعدة V1 (مشروع Supabase `nile-market`) كانت **فارغة تمامًا** — صفر
  جداول وصفر migrations — عند اتخاذ القرار، أي **لا توجد بيانات إنتاج
  تُفقد**.
- تطبيقها كان سيُنشئ جداول النظام القديم (نظام المسوّقين وعمولة المنصة
  على الطلبات) في قاعدة لا تستخدمها V1 — وهو ما تستبعده القرارات
  **D11** و**D12** و**D13**.
- المخطط الصحيح يُبنى من الصفر في `supabase/migrations/` ابتداءً من
  `0001`.

## قواعد التعامل معها

| القاعدة | |
|---|---|
| حذف أي ملف منها | ❌ ممنوع |
| تعديل أو إعادة كتابة أي سطر | ❌ ممنوع |
| خلطها مع `supabase/migrations/` الجديدة | ❌ ممنوع |
| تطبيقها على قاعدة V1 | ❌ ممنوع |
| قراءتها كمرجع تاريخي | ✅ مسموح ومفيد |

## القرارات المرتبطة

- **D11** — نظام المسوّقين القديم خارج V1، بلا حذف له ولا لبياناته.
- **D12** — `platform_commission_rate` لا يُستخدم في V1.
- **D13** — مصدر دخل V1 = اشتراكات التجار فقط.
- **D34** — نقل هذه الملفات إلى هنا وبدء migrations جديدة من `0001`.

التفاصيل الكاملة في [`/docs/OPEN-QUESTIONS.md`](../../docs/OPEN-QUESTIONS.md)
و[`/docs/NILE-MARKET-SPEC.md`](../../docs/NILE-MARKET-SPEC.md).

## الفهرس التاريخي

| # | الملف | الموضوع |
|---|---|---|
| 0001 | `core_schema` | profiles · stores · products · cart · orders · notifications · plans |
| 0002 | `core_schema_security_hardening` | `search_path` + سحب صلاحيات التنفيذ |
| 0003 | `signup_role_and_role_guard` | اختيار الدور عند التسجيل + حماية `role` |
| 0004 | `checkout_function` | `checkout_cart` |
| 0005 | `product_views` | عدّاد المشاهدات |
| 0006 | `seller_free_trial` | تجربة 30 يومًا تلقائية |
| 0007 | `products_require_active_store` | إخفاء منتجات المتاجر غير النشطة |
| 0008 | `admin_subscription_approval` | اعتماد طلب الاشتراك ذرّيًا |
| 0009 | `marketer_role` | إضافة قيمة `marketer` للـenum |
| 0010 | `product_marketers` | نظام مسوّقي المنتجات + المسحوبات |
| 0011 | `protect_commission_fields` | حماية أعمدة العمولة |
| 0012 | `platform_marketers_50` | برنامج «الـ50 مسوّقًا» |
| 0013 | `store_owner_marketer_visibility` | رؤية التاجر لمسوّقيه |
| 0014 | `store_employees` | موظفو المتجر (بلا أدوار) |
| 0015 | `affiliate_link_tracking` | روابط الأفلييت وتتبع النقرات |
| 0016 | `store_owner_marketer_visibility_fix` | تصحيح سياسة الرؤية |
| 0017 | `platform_commission` | عمولة المنصة على الطلبات |
| 0018 | `wallet_ledger_and_payouts` | المحافظ ونظام السحب الموحّد |
| 0019 | `harden_financial_rpc_grants` | تقييد صلاحيات RPC المالية |
| 0020 | `harden_financial_rpc_grants_anon` | سحبها من `anon` صراحة |
| 0021 | `fix_handle_new_user_search_path` | إصلاح `search_path` الذي كان يكسر التسجيل |
