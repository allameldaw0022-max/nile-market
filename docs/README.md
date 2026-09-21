# Nile Market — وثائق المشروع الهندسية

> هذه المجلد هو **Source of Truth الهندسي** للمشروع. ملف المواصفات
> `NILE-MARKET-SPEC.md` هو المرجع التجاري، وبقية الملفات تترجمه إلى
> معمارية وقرارات تنفيذية.
>
> **المرحلة الحالية: PLANNING مكتملة — كل القرارات معتمدة (2026-09-21).**
> التنفيذ (Phase 2) لم يبدأ — بانتظار الإذن الصريح.

## الفهرس

| الملف | المحتوى |
|---|---|
| [`NILE-MARKET-SPEC.md`](./NILE-MARKET-SPEC.md) | خلاصة المواصفات المعتمدة + القرارات النهائية + نطاق الإصدار الأول |
| [`AUDIT-CURRENT-PROJECT.md`](./AUDIT-CURRENT-PROJECT.md) | فحص الكود والقاعدة الحاليين: ما يُعاد استخدامه، ما يُعاد بناؤه، الثغرات |
| [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md) | **سجل القرارات النهائية** (D-Q1 → D-Q14) + نقاط ناتجة عنها تنتظر توضيحًا |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | المعمارية العامة، الأربع تطبيقات، حدود Server/Client، Tenant Resolution |
| [`DATABASE.md`](./DATABASE.md) | مخطط قاعدة البيانات الكامل: الجداول والأعمدة والعلاقات والفهارس |
| [`RLS.md`](./RLS.md) | استراتيجية RLS، دوال المساعدة، سياسة كل جدول، Isolation Matrix |
| [`PERMISSIONS.md`](./PERMISSIONS.md) | الأدوار، مصفوفة الصلاحيات، Data Access Scope لكل دور |
| [`API.md`](./API.md) | Server Actions / API Routes / RPC، التحقق، الأخطاء، Idempotency |
| [`SUBSCRIPTIONS.md`](./SUBSCRIPTIONS.md) | Subscription & Entitlements Engine، دورة الحياة، تطبيق الحدود |
| [`PAYMENTS.md`](./PAYMENTS.md) | الدفع، الاسترداد، Financial Ledger، حساب المبالغ Server-side |
| [`COMMISSIONS.md`](./COMMISSIONS.md) | الشركاء، الإحالة، العمولة 50%، Ledger، الدفعات، العكس |
| [`DOMAINS.md`](./DOMAINS.md) | النطاقات الفرعية والدومينات المخصصة، التحقق، SSL، SEO |
| [`ROUTES.md`](./ROUTES.md) | خريطة المسارات الكاملة للمنصة والمتجر ولوحة التاجر وAdmin |
| [`STORAGE.md`](./STORAGE.md) | Buckets، الملكية، التحقق، سياسات الوصول، معالجة الصور |
| [`NOTIFICATIONS.md`](./NOTIFICATIONS.md) | الإشعارات داخل المنصة والبريد، Deduplication، Background Jobs |
| [`SUPPORT.md`](./SUPPORT.md) | نظام تذاكر الدعم، الحالات، الملاحظات الداخلية، العزل |
| [`SECURITY.md`](./SECURITY.md) | Threat Model كامل مع Mitigation لكل خطر |
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | الألوان، Typography، المكوّنات، RTL، الحالات |
| [`PERFORMANCE.md`](./PERFORMANCE.md) | الأداء، Caching، PWA، الإنترنت الضعيف، حدود Free Tier |
| [`TESTING.md`](./TESTING.md) | خطة الاختبار الكاملة مع تركيز على عزل المتاجر |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Vercel + Supabase، البيئات، المتغيرات، Migrations، Backup |
| [`ROADMAP.md`](./ROADMAP.md) | مراحل التنفيذ، التبعيات، Definition of Done |

## قواعد ثابتة تسري على كل الملفات

1. لا يُتخذ قرار يؤثر على **المال أو الصلاحيات أو الأمان أو حذف البيانات**
   من طرف المنفّذ؛ يُسجَّل في `OPEN-QUESTIONS.md`.
2. كل عملية حساسة تُتحقق **على الخادم وقاعدة البيانات**، لا الواجهة.
3. لا تُحذف بيانات تاجر أو سجل مالي بسبب انتهاء اشتراك أو إغلاق حساب.
4. لا أسرار داخل الكود أو المستودع — Environment Variables فقط.
