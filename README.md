# نايل ماركت — Nile Market

منصة SaaS سودانية لإنشاء وإدارة المتاجر الإلكترونية. كل تاجر يحصل على
متجر ويب مستقل على دومينه الخاص أو نطاق فرعي، ولوحة تحكم كاملة.

> **المصدر النهائي للحقيقة:** ملف المواصفات المعتمد +
> [`docs/NILE-MARKET-SPEC.md`](docs/NILE-MARKET-SPEC.md) + سجل القرارات
> D1–D34. لا تُخترع قواعد عمل خارجها.

## التقنيات

Next.js 16 (App Router · Turbopack) · React 19 · TypeScript ·
Tailwind CSS v4 · Supabase (PostgreSQL 17 + Auth + Storage) · Vercel

## التشغيل محليًا

```bash
npm install
cp .env.example .env.local     # املأ القيم من Supabase → Settings → API
npm run dev
```

## الأوامر

```bash
npm run dev        # خادم التطوير
npm run build      # بناء الإنتاج
npm run lint       # فحص الكود (يشمل حارس منع استيراد العميل الخدمي)
npm run typecheck  # فحص الأنواع
npm run test:db    # ★ اختبارات القاعدة وعزل المتاجر (يحتاج PostgreSQL محليًا)
```

## الهيكل

```
src/
  proxy.ts                 حل المستأجر من الـHost + تجديد الجلسة
  app/
    (platform)/            nilemarket.online — التسويق والمصادقة
    (storefront)/sites/    متجر المستأجر (يُوصل إليه بالـrewrite فقط)
  lib/
    authz/                 ★ الجدار الأول للسلطة — كل Server Action تبدأ منه
    auth/actor.ts          الفاعل الحالي (يفشل مغلقًا)
    tenant/resolve.ts      Host → Store (المسار الوحيد المسموح)
    supabase/service.ts    ⚠️ يتجاوز RLS — للنظام فقط
supabase/
  migrations/              ★ مخطط V1 — المصدر الوحيد لأي تغيير
  legacy-migrations/       النظام السابق، محفوظ ولا يُطبَّق (D34)
  tests/                   اختبارات RLS وعزل المتاجر التنفيذية
docs/                      23 وثيقة هندسية معتمدة
```

## الأمان — ثلاثة جدران

| # | الجدار | أين |
|---|---|---|
| 1 | `requireStoreAccess` / `requirePlatformAccess` | `lib/authz/guards.ts` |
| 2 | RLS على كل جدول (148 سياسة) | `supabase/migrations/` |
| 3 | قيود CHECK وtriggers | القاعدة — **لا يتجاوزها service_role** |

سقوط جدار واحد لا يكفي لاختراق النظام. مُثبَت بـ144 تأكيدًا تنفيذيًا:

```bash
npm run test:db
```

أهم ما تُثبته: **متجر A لا يصل إلى بيانات متجر B بأي طريق** — لا عبر
الواجهة، ولا PostgREST مباشرة، ولا بتغيير معرّف في الطلب.
